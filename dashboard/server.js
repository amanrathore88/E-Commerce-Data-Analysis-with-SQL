const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to SQLite database
const dbPath = path.join(__dirname, '../ecommerce_test.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// CORS - allow requests from file:// protocol and localhost variants
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Helper function to build dynamic WHERE clauses based on filters
function buildFilters(query) {
  const clauses = [];
  const args = [];

  if (query.startDate) {
    clauses.push("o.order_date >= ?");
    args.push(query.startDate);
  }
  if (query.endDate) {
    clauses.push("o.order_date <= ?");
    args.push(query.endDate);
  }
  if (query.city) {
    clauses.push("c.city = ?");
    args.push(query.city);
  }
  if (query.customer) {
    clauses.push("c.customer_id = ?");
    args.push(parseInt(query.customer));
  }
  if (query.gender) {
    clauses.push("c.gender = ?");
    args.push(query.gender);
  }
  if (query.category) {
    clauses.push("p.category = ?");
    args.push(query.category);
  }
  if (query.product) {
    clauses.push("p.product_id = ?");
    args.push(parseInt(query.product));
  }
  if (query.status) {
    clauses.push("o.order_status = ?");
    args.push(query.status);
  }

  const whereClause = clauses.length > 0 ? "WHERE " + clauses.join(" AND ") : "";
  return { whereClause, args };
}

// 1. Get Filter Options Metadata
app.get('/api/filters-data', (req, res) => {
  const data = {};
  
  db.serialize(() => {
    // Cities
    db.all("SELECT DISTINCT city FROM customers WHERE city IS NOT NULL ORDER BY city", [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      data.cities = rows.map(r => r.city);

      // Categories
      db.all("SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        data.categories = rows.map(r => r.category);

        // Products
        db.all("SELECT product_id, product_name, category FROM products ORDER BY product_name", [], (err, rows) => {
          if (err) return res.status(500).json({ error: err.message });
          data.products = rows;

          // Customers
          db.all("SELECT customer_id, customer_name, city FROM customers ORDER BY customer_name", [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            data.customers = rows;

            // Statuses
            db.all("SELECT DISTINCT order_status FROM orders ORDER BY order_status", [], (err, rows) => {
              if (err) return res.status(500).json({ error: err.message });
              data.statuses = rows.map(r => r.order_status);

              // Date Bounds
              db.get("SELECT MIN(order_date) AS min_date, MAX(order_date) AS max_date FROM orders", [], (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                data.dateRange = row;
                res.json(data);
              });
            });
          });
        });
      });
    });
  });
});

// 2. Get KPI Cards
app.get('/api/kpis', (req, res) => {
  const { whereClause, args } = buildFilters(req.query);

  // Base query for core transaction metrics (revenue, orders, units, customer/product active lists)
  const query = `
    SELECT
      SUM(CASE WHEN o.order_status = 'Delivered' THEN oi.quantity * oi.unit_price ELSE 0.0 END) AS recognized_revenue,
      SUM(oi.quantity * oi.unit_price) AS gross_booking_value,
      SUM(CASE WHEN o.order_status IN ('Delivered', 'Pending') THEN oi.quantity * oi.unit_price ELSE 0.0 END) AS net_pipeline_value,
      SUM(oi.quantity) AS total_units_sold,
      COUNT(DISTINCT o.order_id) AS total_orders,
      COUNT(DISTINCT CASE WHEN o.order_status = 'Delivered' THEN o.order_id END) AS delivered_orders,
      COUNT(DISTINCT CASE WHEN o.order_status = 'Cancelled' THEN o.order_id END) AS cancelled_orders,
      COUNT(DISTINCT o.customer_id) AS total_customers,
      COUNT(DISTINCT oi.product_id) AS total_products
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.order_id
    JOIN products p ON oi.product_id = p.product_id
    JOIN customers c ON o.customer_id = c.customer_id
    ${whereClause}
  `;

  // Fetch total registered customers under city/gender/id constraints
  const registeredClauses = [];
  const registeredArgs = [];
  if (req.query.city) { registeredClauses.push("city = ?"); registeredArgs.push(req.query.city); }
  if (req.query.gender) { registeredClauses.push("gender = ?"); registeredArgs.push(req.query.gender); }
  if (req.query.customer) { registeredClauses.push("customer_id = ?"); registeredArgs.push(parseInt(req.query.customer)); }
  const registeredWhere = registeredClauses.length > 0 ? "WHERE " + registeredClauses.join(" AND ") : "";
  const registeredQuery = `SELECT COUNT(*) AS total_registered FROM customers ${registeredWhere}`;

  // Fetch total catalog products under category/product constraints
  const catalogClauses = [];
  const catalogArgs = [];
  if (req.query.category) { catalogClauses.push("category = ?"); catalogArgs.push(req.query.category); }
  if (req.query.product) { catalogClauses.push("product_id = ?"); catalogArgs.push(parseInt(req.query.product)); }
  const catalogWhere = catalogClauses.length > 0 ? "WHERE " + catalogClauses.join(" AND ") : "";
  const catalogQuery = `SELECT COUNT(*) AS total_catalog_products FROM products ${catalogWhere}`;

  // Fetch Repeat Purchase Rate (RPR) for delivered order buyers
  const rprQuery = `
    WITH customer_delivered AS (
      SELECT o.customer_id, COUNT(DISTINCT o.order_id) AS delivered_count
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.order_id
      JOIN products p ON oi.product_id = p.product_id
      JOIN customers c ON o.customer_id = c.customer_id
      ${whereClause ? whereClause + ' AND' : 'WHERE'} o.order_status = 'Delivered'
      GROUP BY o.customer_id
    )
    SELECT
      COUNT(CASE WHEN delivered_count > 1 THEN 1 END) AS repeat_buyers,
      COUNT(*) AS active_purchasers
    FROM customer_delivered
  `;

  db.get(query, args, (err, kpiRow) => {
    if (err) return res.status(500).json({ error: err.message });

    db.get(registeredQuery, registeredArgs, (err, regRow) => {
      if (err) return res.status(500).json({ error: err.message });

      db.get(catalogQuery, catalogArgs, (err, catRow) => {
        if (err) return res.status(500).json({ error: err.message });

        db.get(rprQuery, args, (err, rprRow) => {
          if (err) return res.status(500).json({ error: err.message });

          const totalOrders = kpiRow.total_orders || 0;
          const cancelledOrders = kpiRow.cancelled_orders || 0;
          const deliveredOrders = kpiRow.delivered_orders || 0;
          const recognizedRevenue = kpiRow.recognized_revenue || 0;

          const repeatBuyers = rprRow ? rprRow.repeat_buyers : 0;
          const activePurchasers = rprRow ? rprRow.active_purchasers : 0;

          const repeatPurchaseRate = activePurchasers > 0 ? (repeatBuyers * 100.0 / activePurchasers) : 0.0;
          const averageOrderValue = deliveredOrders > 0 ? (recognizedRevenue / deliveredOrders) : 0.0;
          const cancellationRate = totalOrders > 0 ? (cancelledOrders * 100.0 / totalOrders) : 0.0;

          // Customer lifetime value (Historical CLV) = Recognized Revenue / Total customers in filtered cohort
          const totalCustomersCohort = kpiRow.total_customers || 0;
          const clvHistorical = totalCustomersCohort > 0 ? (recognizedRevenue / totalCustomersCohort) : 0.0;

          res.json({
            recognizedRevenue,
            grossBookingValue: kpiRow.gross_booking_value || 0,
            netPipelineValue: kpiRow.net_pipeline_value || 0,
            totalOrders,
            deliveredOrders,
            cancelledOrders,
            totalCustomersRegistered: regRow.total_registered,
            totalCustomersCohort,
            totalProductsCatalog: catRow.total_catalog_products,
            totalProductsActive: kpiRow.total_products || 0,
            totalUnitsSold: kpiRow.total_units_sold || 0,
            averageOrderValue,
            cancellationRate,
            repeatPurchaseRate,
            clvHistorical
          });
        });
      });
    });
  });
});

// 3. Revenue & Sales Trend Over Time (Time-series)
app.get('/api/revenue-trend', (req, res) => {
  const { whereClause, args } = buildFilters(req.query);

  // Group by month
  const monthlyQuery = `
    SELECT
      strftime('%Y-%m', o.order_date) AS month,
      SUM(CASE WHEN o.order_status = 'Delivered' THEN oi.quantity * oi.unit_price ELSE 0.0 END) AS recognized_revenue,
      SUM(oi.quantity * oi.unit_price) AS gross_booking_value,
      COUNT(DISTINCT o.order_id) AS total_orders,
      COUNT(DISTINCT CASE WHEN o.order_status = 'Delivered' THEN o.order_id END) AS delivered_orders,
      SUM(oi.quantity) AS total_units
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.order_id
    JOIN products p ON oi.product_id = p.product_id
    JOIN customers c ON o.customer_id = c.customer_id
    ${whereClause}
    GROUP BY strftime('%Y-%m', o.order_date)
    ORDER BY month
  `;

  // Group by day (for drill-down or detailed views when date range is short)
  const dailyQuery = `
    SELECT
      o.order_date AS date,
      SUM(CASE WHEN o.order_status = 'Delivered' THEN oi.quantity * oi.unit_price ELSE 0.0 END) AS recognized_revenue,
      SUM(oi.quantity * oi.unit_price) AS gross_booking_value,
      COUNT(DISTINCT o.order_id) AS total_orders,
      SUM(oi.quantity) AS total_units
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.order_id
    JOIN products p ON oi.product_id = p.product_id
    JOIN customers c ON o.customer_id = c.customer_id
    ${whereClause}
    GROUP BY o.order_date
    ORDER BY date
  `;

  db.all(monthlyQuery, args, (err, monthlyRows) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(dailyQuery, args, (err, dailyRows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // Calculate MoM growth for monthly data
      const monthlyWithGrowth = monthlyRows.map((row, idx, arr) => {
        const prevRow = idx > 0 ? arr[idx - 1] : null;
        let momGrowth = null;
        if (prevRow && prevRow.recognized_revenue > 0) {
          momGrowth = ((row.recognized_revenue - prevRow.recognized_revenue) * 100.0 / prevRow.recognized_revenue);
        }
        return {
          ...row,
          aov: row.delivered_orders > 0 ? (row.recognized_revenue / row.delivered_orders) : 0,
          momGrowth
        };
      });

      res.json({
        monthly: monthlyWithGrowth,
        daily: dailyRows
      });
    });
  });
});

// 4. Running Revenue Over Time (Cumulative)
app.get('/api/running-revenue', (req, res) => {
  const { whereClause, args } = buildFilters(req.query);

  const query = `
    WITH daily_sales AS (
      SELECT
        o.order_date AS date,
        SUM(CASE WHEN o.order_status = 'Delivered' THEN oi.quantity * oi.unit_price ELSE 0.0 END) AS daily_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.order_id
      JOIN products p ON oi.product_id = p.product_id
      JOIN customers c ON o.customer_id = c.customer_id
      ${whereClause}
      GROUP BY o.order_date
    )
    SELECT
      date,
      daily_revenue,
      SUM(daily_revenue) OVER (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_revenue
    FROM daily_sales
    ORDER BY date
  `;

  db.all(query, args, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 5. Category Analysis
app.get('/api/category-analysis', (req, res) => {
  const { whereClause, args } = buildFilters(req.query);

  const query = `
    SELECT
      p.category,
      SUM(CASE WHEN o.order_status = 'Delivered' THEN oi.quantity * oi.unit_price ELSE 0.0 END) AS recognized_revenue,
      SUM(oi.quantity) AS total_units_sold,
      COUNT(DISTINCT o.order_id) AS total_orders
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.order_id
    JOIN products p ON oi.product_id = p.product_id
    JOIN customers c ON o.customer_id = c.customer_id
    ${whereClause}
    GROUP BY p.category
    ORDER BY recognized_revenue DESC
  `;

  db.all(query, args, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const totalRevenue = rows.reduce((sum, r) => sum + r.recognized_revenue, 0);
    const result = rows.map(r => ({
      ...r,
      revenueContributionPct: totalRevenue > 0 ? (r.recognized_revenue * 100.0 / totalRevenue) : 0.0
    }));

    res.json(result);
  });
});

// 6. Product Analysis
app.get('/api/product-analysis', (req, res) => {
  const { whereClause, args } = buildFilters(req.query);

  // General query for product summary table (and charts)
  const summaryQuery = `
    SELECT
      p.product_id,
      p.product_name,
      p.category,
      p.unit_price AS catalog_unit_price,
      SUM(CASE WHEN o.order_status = 'Delivered' THEN oi.quantity ELSE 0 END) AS total_units_sold,
      COUNT(DISTINCT CASE WHEN o.order_status = 'Delivered' THEN o.order_id END) AS total_orders_count,
      SUM(CASE WHEN o.order_status = 'Delivered' THEN oi.quantity * oi.unit_price ELSE 0.0 END) AS total_recognized_revenue
    FROM products p
    LEFT JOIN order_items oi ON p.product_id = oi.product_id
    LEFT JOIN orders o ON oi.order_id = o.order_id
    LEFT JOIN customers c ON o.customer_id = c.customer_id
    ${whereClause ? whereClause : ''}
    GROUP BY p.product_id, p.product_name, p.category, p.unit_price
  `;

  db.all(summaryQuery, args, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const totalRevenue = rows.reduce((sum, r) => sum + r.total_recognized_revenue, 0);
    
    // Sort, calculate contribution %, and assign ranks
    const sortedByRevenue = [...rows].sort((a, b) => b.total_recognized_revenue - a.total_recognized_revenue);
    const processedRows = sortedByRevenue.map((r, idx) => ({
      ...r,
      revenueContributionPct: totalRevenue > 0 ? (r.total_recognized_revenue * 100.0 / totalRevenue) : 0.0,
      revenueRank: idx + 1
    }));

    // Find top 10 by units sold
    const topByUnits = [...processedRows].sort((a, b) => b.total_units_sold - a.total_units_sold).slice(0, 10);
    // Find top 10 by revenue
    const topByRevenue = [...processedRows].slice(0, 10);
    // Find worst selling (bottom 5, with at least 0 sales)
    const worstSelling = [...processedRows].sort((a, b) => a.total_recognized_revenue - b.total_recognized_revenue).slice(0, 5);

    // Most expensive product sold (among items transacted)
    const activeItemsQuery = `
      SELECT p.product_name, p.unit_price
      FROM products p
      JOIN order_items oi ON p.product_id = oi.product_id
      JOIN orders o ON oi.order_id = o.order_id
      JOIN customers c ON o.customer_id = c.customer_id
      ${whereClause ? whereClause : ''}
      ORDER BY p.unit_price DESC
      LIMIT 1
    `;

    db.get(activeItemsQuery, args, (err, maxPriceRow) => {
      if (err) return res.status(500).json({ error: err.message });

      res.json({
        productsList: processedRows,
        top10ByUnits: topByUnits,
        top10ByRevenue: topByRevenue,
        worstSelling: worstSelling,
        mostExpensiveProduct: maxPriceRow || null
      });
    });
  });
});

// 7. Geographic Analysis
app.get('/api/geographic-analysis', (req, res) => {
  const { whereClause, args } = buildFilters(req.query);

  const query = `
    SELECT
      c.city,
      SUM(CASE WHEN o.order_status = 'Delivered' THEN oi.quantity * oi.unit_price ELSE 0.0 END) AS recognized_revenue,
      COUNT(DISTINCT o.order_id) AS total_orders,
      COUNT(DISTINCT c.customer_id) AS total_customers
    FROM customers c
    LEFT JOIN orders o ON c.customer_id = o.customer_id
    LEFT JOIN order_items oi ON o.order_id = oi.order_id
    LEFT JOIN products p ON oi.product_id = p.product_id
    ${whereClause ? whereClause + ' AND c.city IS NOT NULL' : 'WHERE c.city IS NOT NULL'}
    GROUP BY c.city
    ORDER BY recognized_revenue DESC
  `;

  db.all(query, args, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 8. Customer Analysis & Demographics
app.get('/api/customer-analysis', (req, res) => {
  const { whereClause, args } = buildFilters(req.query);

  // Customer table details with dynamic spend aggregation
  const customerBaseQuery = `
    SELECT
      c.customer_id,
      c.customer_name,
      c.city,
      c.gender,
      COUNT(DISTINCT o.order_id) AS total_orders,
      COUNT(DISTINCT CASE WHEN o.order_status = 'Delivered' THEN o.order_id END) AS delivered_orders,
      SUM(CASE WHEN o.order_status = 'Delivered' THEN oi.quantity * oi.unit_price ELSE 0.0 END) AS recognized_spend,
      MAX(CASE WHEN o.order_status = 'Delivered' THEN o.order_date END) AS last_qualifying_order
    FROM customers c
    LEFT JOIN orders o ON c.customer_id = o.customer_id
    LEFT JOIN order_items oi ON o.order_id = oi.order_id
    LEFT JOIN products p ON oi.product_id = p.product_id
    ${whereClause ? whereClause : ''}
    GROUP BY c.customer_id, c.customer_name, c.city, c.gender
  `;

  db.all(customerBaseQuery, args, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    // Calculate Anchor Date dynamically based on active filter set (or database absolute max)
    const anchorQuery = `SELECT MAX(order_date) AS max_date FROM orders o 
                         LEFT JOIN order_items oi ON o.order_id = oi.order_id
                         LEFT JOIN products p ON oi.product_id = p.product_id
                         LEFT JOIN customers c ON o.customer_id = c.customer_id
                         ${whereClause}`;
    
    db.get(anchorQuery, args, (err, anchorRow) => {
      if (err) return res.status(500).json({ error: err.message });
      const anchorDateStr = anchorRow.max_date || '2026-07-25';
      const anchorDate = new Date(anchorDateStr);

      const processedCustomers = rows.map(r => {
        let daysSinceLastOrder = null;
        if (r.last_qualifying_order) {
          const diffTime = Math.abs(anchorDate - new Date(r.last_qualifying_order));
          daysSinceLastOrder = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        // Cohort classification
        let purchasingCohort = 'Never-Purchased';
        if (r.total_orders > 0) {
          if (r.delivered_orders === 0) purchasingCohort = 'No Qualifying Purchase';
          else if (r.delivered_orders === 1) purchasingCohort = 'One-Time Buyer';
          else purchasingCohort = 'Repeat Purchaser';
        }

        return {
          ...r,
          aov: r.delivered_orders > 0 ? (r.recognized_spend / r.delivered_orders) : 0.0,
          daysSinceLastOrder,
          purchasingCohort
        };
      });

      // Sort by spending
      const sortedBySpend = [...processedCustomers].sort((a, b) => b.recognized_spend - a.recognized_spend);

      // Gender Revenue breakdown
      const genderBreakdown = processedCustomers.reduce((acc, c) => {
        acc[c.gender] = (acc[c.gender] || 0) + c.recognized_spend;
        return acc;
      }, {});

      // Purchasing Cohorts sizing
      const cohortBreakdown = processedCustomers.reduce((acc, c) => {
        acc[c.purchasingCohort] = (acc[c.purchasingCohort] || 0) + 1;
        return acc;
      }, {
        'Never-Purchased': 0,
        'No Qualifying Purchase': 0,
        'One-Time Buyer': 0,
        'Repeat Purchaser': 0
      });

      // Highest-Value Order details per customer
      const highestValueOrderQuery = `
        WITH customer_order_totals AS (
          SELECT
            o.customer_id,
            o.order_id,
            o.order_date,
            o.order_status,
            SUM(oi.quantity * oi.unit_price) AS order_total
          FROM orders o
          JOIN order_items oi ON o.order_id = oi.order_id
          JOIN products p ON oi.product_id = p.product_id
          JOIN customers c ON o.customer_id = c.customer_id
          ${whereClause}
          GROUP BY o.customer_id, o.order_id, o.order_date, o.order_status
        ),
        ranked_orders AS (
          SELECT
            customer_id,
            order_id,
            order_date,
            order_status,
            order_total,
            ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_total DESC) AS rnk
          FROM customer_order_totals
        )
        SELECT customer_id, order_id, order_date, order_status, order_total
        FROM ranked_orders
        WHERE rnk = 1
      `;

      db.all(highestValueOrderQuery, args, (err, maxOrderRows) => {
        if (err) return res.status(500).json({ error: err.message });

        const maxOrderMap = maxOrderRows.reduce((acc, row) => {
          acc[row.customer_id] = row;
          return acc;
        }, {});

        const finalCustomers = processedCustomers.map(c => ({
          ...c,
          highestOrder: maxOrderMap[c.customer_id] || null
        }));

        res.json({
          customersList: finalCustomers,
          topCustomers: sortedBySpend.slice(0, 10),
          genderRevenue: genderBreakdown,
          cohortSizes: cohortBreakdown,
          anchorDate: anchorDateStr
        });
      });
    });
  });
});

// 9. Retention Analysis (Monthly Active Customers & Cohorts)
app.get('/api/retention-analysis', (req, res) => {
  const { whereClause, args } = buildFilters(req.query);

  // Monthly active customers: count unique customers placing an order in each month
  const activeQuery = `
    SELECT
      strftime('%Y-%m', o.order_date) AS month,
      COUNT(DISTINCT o.customer_id) AS active_customers,
      COUNT(DISTINCT CASE WHEN o.order_status = 'Delivered' THEN o.customer_id END) AS active_delivered_customers
    FROM orders o
    JOIN order_items oi ON o.order_id = oi.order_id
    JOIN products p ON oi.product_id = p.product_id
    JOIN customers c ON o.customer_id = c.customer_id
    ${whereClause}
    GROUP BY strftime('%Y-%m', o.order_date)
    ORDER BY month
  `;

  // Signup cohorts matrix
  // SQLite equivalents: strftime('%Y-%m', signup_date) and date arithmetic using strftime/julianday or extraction logic
  const cohortQuery = `
    WITH first_purchases AS (
      SELECT
        o.customer_id,
        MIN(strftime('%Y-%m', o.order_date)) AS first_order_month
      FROM orders o
      JOIN order_items oi ON o.order_id = oi.order_id
      JOIN products p ON oi.product_id = p.product_id
      JOIN customers c ON o.customer_id = c.customer_id
      ${whereClause ? whereClause + ' AND' : 'WHERE'} o.order_status = 'Delivered'
      GROUP BY o.customer_id
    ),
    cohort_sizes AS (
      SELECT
        first_order_month AS cohort_month,
        COUNT(customer_id) AS cohort_size
      FROM first_purchases
      GROUP BY first_order_month
    ),
    activity_months AS (
      SELECT DISTINCT
        o.customer_id,
        fp.first_order_month AS cohort_month,
        -- Calculate months difference: (Year2 - Year1) * 12 + (Month2 - Month1)
        (CAST(strftime('%Y', o.order_date) AS INTEGER) - CAST(substr(fp.first_order_month, 1, 4) AS INTEGER)) * 12 +
        (CAST(strftime('%m', o.order_date) AS INTEGER) - CAST(substr(fp.first_order_month, 6, 2) AS INTEGER)) AS month_index
      FROM orders o
      JOIN first_purchases fp ON o.customer_id = fp.customer_id
      JOIN order_items oi ON o.order_id = oi.order_id
      JOIN products p ON oi.product_id = p.product_id
      JOIN customers c ON o.customer_id = c.customer_id
      ${whereClause ? whereClause + ' AND' : 'WHERE'} o.order_status = 'Delivered'
    )
    SELECT
      cs.cohort_month,
      cs.cohort_size,
      month_index,
      COUNT(DISTINCT am.customer_id) AS active_count
    FROM cohort_sizes cs
    LEFT JOIN activity_months am ON cs.cohort_month = am.cohort_month
    WHERE month_index >= 0 AND month_index <= 6
    GROUP BY cs.cohort_month, cs.cohort_size, month_index
    ORDER BY cs.cohort_month, month_index
  `;

  db.all(activeQuery, args, (err, activeRows) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(cohortQuery, args, (err, cohortRows) => {
      if (err) return res.status(500).json({ error: err.message });

      // Transform flat cohort output into matrix table
      const matrix = {};
      cohortRows.forEach(row => {
        if (!matrix[row.cohort_month]) {
          matrix[row.cohort_month] = {
            cohortMonth: row.cohort_month,
            cohortSize: row.cohort_size,
            retention: Array(7).fill(0)
          };
        }
        if (row.month_index < 7) {
          matrix[row.cohort_month].retention[row.month_index] = row.active_count;
        }
      });

      res.json({
        monthlyActive: activeRows,
        cohortMatrix: Object.values(matrix)
      });
    });
  });
});

// 10. Churn & Inactivity Analysis (Dedicated Customer Risk Section)
app.get('/api/churn-analysis', (req, res) => {
  const { whereClause, args } = buildFilters(req.query);

  // In this analysis, we fetch customer summaries and rank risk based on last order recency
  const anchorQuery = `SELECT MAX(order_date) AS max_date FROM orders o 
                       LEFT JOIN order_items oi ON o.order_id = oi.order_id
                       LEFT JOIN products p ON oi.product_id = p.product_id
                       LEFT JOIN customers c ON o.customer_id = c.customer_id
                       ${whereClause}`;

  db.get(anchorQuery, args, (err, anchorRow) => {
    if (err) return res.status(500).json({ error: err.message });
    const anchorDateStr = anchorRow.max_date || '2026-07-25';
    const anchorDate = new Date(anchorDateStr);

    const query = `
      SELECT
        c.customer_id,
        c.customer_name,
        c.city,
        c.gender,
        COUNT(DISTINCT o.order_id) AS total_orders,
        COUNT(DISTINCT CASE WHEN o.order_status = 'Delivered' THEN o.order_id END) AS delivered_orders,
        MAX(CASE WHEN o.order_status = 'Delivered' THEN o.order_date END) AS last_qualifying_order
      FROM customers c
      LEFT JOIN orders o ON c.customer_id = o.customer_id
      LEFT JOIN order_items oi ON o.order_id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.product_id
      ${whereClause ? whereClause : ''}
      GROUP BY c.customer_id, c.customer_name, c.city, c.gender
    `;

    db.all(query, args, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const cohort = rows.map(r => {
        let daysInactive = null;
        if (r.last_qualifying_order) {
          const diffTime = Math.abs(anchorDate - new Date(r.last_qualifying_order));
          daysInactive = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
        return { ...r, daysInactive };
      });

      // Filter based on inactivity / churn rules:
      // Churn-risk proxy: Ordering customer with daysInactive > 120 days
      // Inactive customer: Ordering customer with daysInactive > 90 days
      // Never-Purchased: Ordering customers with total_orders = 0
      const activePurchasers = cohort.filter(c => c.total_orders > 0);
      const buyingCohortSize = activePurchasers.length;

      const inactiveCustomers = activePurchasers.filter(c => c.daysInactive > 90);
      const churnRiskCustomers = activePurchasers.filter(c => c.daysInactive > 120);
      const neverPurchasedCustomers = cohort.filter(c => c.total_orders === 0);

      const activeChurnRatePct = buyingCohortSize > 0 ? (inactiveCustomers.length * 100.0 / buyingCohortSize) : 0.0;
      const neverPurchasedRatePct = cohort.length > 0 ? (neverPurchasedCustomers.length * 100.0 / cohort.length) : 0.0;

      res.json({
        anchorDate: anchorDateStr,
        buyingCohortSize,
        totalCustomers: cohort.length,
        inactiveCount: inactiveCustomers.length,
        churnRiskCount: churnRiskCustomers.length,
        neverPurchasedCount: neverPurchasedCustomers.length,
        activeChurnRatePct,
        neverPurchasedRatePct,
        inactiveList: inactiveCustomers.sort((a, b) => b.daysInactive - a.daysInactive),
        churnRiskList: churnRiskCustomers.sort((a, b) => b.daysInactive - a.daysInactive),
        neverPurchasedList: neverPurchasedCustomers
      });
    });
  });
});

// 11. RFM Analysis
app.get('/api/rfm-analysis', (req, res) => {
  const { whereClause, args } = buildFilters(req.query);

  // We will build a dynamic RFM computation. It extracts customers with delivered orders,
  // computes R, F, M rankings, and classifies them into segments.
  const anchorQuery = `SELECT MAX(order_date) AS max_date FROM orders o
                       LEFT JOIN order_items oi ON o.order_id = oi.order_id
                       LEFT JOIN products p ON oi.product_id = p.product_id
                       LEFT JOIN customers c ON o.customer_id = c.customer_id
                       ${whereClause}`;

  db.get(anchorQuery, args, (err, anchorRow) => {
    if (err) return res.status(500).json({ error: err.message });
    const anchorDateStr = anchorRow.max_date || '2026-07-25';

    // Base query computing Recency, Frequency, and Monetary values
    const query = `
      WITH rfm_base AS (
        SELECT
          c.customer_id,
          c.customer_name,
          c.city,
          c.gender,
          -- Recency: Days between last delivered order and anchor date
          julianday('${anchorDateStr}') - julianday(MAX(CASE WHEN o.order_status = 'Delivered' THEN o.order_date END)) AS recency,
          -- Frequency: Total delivered orders
          COUNT(DISTINCT CASE WHEN o.order_status = 'Delivered' THEN o.order_id END) AS frequency,
          -- Monetary: Total recognized spending
          SUM(CASE WHEN o.order_status = 'Delivered' THEN oi.quantity * oi.unit_price ELSE 0.0 END) AS monetary
        FROM customers c
        JOIN orders o ON c.customer_id = o.customer_id
        JOIN order_items oi ON o.order_id = oi.order_id
        JOIN products p ON oi.product_id = p.product_id
        ${whereClause}
        GROUP BY c.customer_id, c.customer_name, c.city, c.gender
        HAVING COUNT(DISTINCT o.order_id) > 0 AND monetary > 0
      ),
      rfm_ranked AS (
        SELECT
          customer_id,
          customer_name,
          city,
          gender,
          recency,
          frequency,
          monetary,
          -- Score R: 5 represents the lowest recency (most recent). 1 represents longest inactive
          6 - NTILE(5) OVER (ORDER BY recency ASC) AS r_score,
          NTILE(5) OVER (ORDER BY frequency ASC) AS f_score,
          NTILE(5) OVER (ORDER BY monetary ASC) AS m_score
        FROM rfm_base
      )
      SELECT
        customer_id,
        customer_name,
        city,
        gender,
        recency,
        frequency,
        monetary,
        r_score,
        f_score,
        m_score,
        (CAST(r_score AS TEXT) || CAST(f_score AS TEXT) || CAST(m_score AS TEXT)) AS rfm_code,
        CASE
          WHEN r_score >= 4 AND f_score >= 4 AND m_score >= 4 THEN 'Champions'
          WHEN r_score >= 3 AND f_score >= 3 AND m_score >= 3 THEN 'Loyal Customers'
          WHEN r_score >= 4 AND f_score = 1 THEN 'New Customers'
          WHEN r_score <= 2 AND f_score >= 3 AND m_score >= 3 THEN 'At Risk'
          WHEN r_score <= 2 AND f_score <= 2 AND m_score <= 2 THEN 'Hibernating'
          WHEN r_score >= 3 AND f_score >= 2 THEN 'Potential Loyalists'
          ELSE 'About to Sleep'
        END AS customer_segment
      FROM rfm_ranked
    `;

    db.all(query, args, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      // Group segments size and averages
      const segmentsMap = {};
      const segmentsOrder = ['Champions', 'Loyal Customers', 'New Customers', 'Potential Loyalists', 'About to Sleep', 'At Risk', 'Hibernating'];
      
      // Initialize segments map
      segmentsOrder.forEach(seg => {
        segmentsMap[seg] = { segment: seg, size: 0, avgRecency: 0, avgFrequency: 0, avgMonetary: 0, totalMonetary: 0 };
      });

      rows.forEach(r => {
        const seg = r.customer_segment;
        if (!segmentsMap[seg]) {
          segmentsMap[seg] = { segment: seg, size: 0, avgRecency: 0, avgFrequency: 0, avgMonetary: 0, totalMonetary: 0 };
        }
        const s = segmentsMap[seg];
        s.size += 1;
        s.avgRecency += r.recency;
        s.avgFrequency += r.frequency;
        s.avgMonetary += r.monetary;
        s.totalMonetary += r.monetary;
      });

      // Calculate averages
      const segmentsSummary = Object.values(segmentsMap).map(s => {
        if (s.size > 0) {
          s.avgRecency = parseFloat((s.avgRecency / s.size).toFixed(1));
          s.avgFrequency = parseFloat((s.avgFrequency / s.size).toFixed(1));
          s.avgMonetary = parseFloat((s.avgMonetary / s.size).toFixed(2));
          s.totalMonetary = parseFloat(s.totalMonetary.toFixed(2));
        }
        return s;
      });

      res.json({
        customers: rows,
        summary: segmentsSummary
      });
    });
  });
});

// 12. Product Affinity & Basket Analysis (Co-purchase)
app.get('/api/product-affinity', (req, res) => {
  const { whereClause, args } = buildFilters(req.query);

  // We need to count shared orders of Product A and Product B.
  // Avoid double-counting (Product A, B) vs (Product B, A) by enforcing p1.product_id < p2.product_id.
  // We join orders, products, customers to apply filters.
  const query = `
    SELECT
      p1.product_name AS product_a,
      p2.product_name AS product_b,
      p1.category AS category_a,
      p2.category AS category_b,
      COUNT(DISTINCT o.order_id) AS shared_orders
    FROM order_items oi1
    JOIN order_items oi2 ON oi1.order_id = oi2.order_id AND oi1.product_id < oi2.product_id
    JOIN orders o ON oi1.order_id = o.order_id
    JOIN products p1 ON oi1.product_id = p1.product_id
    JOIN products p2 ON oi2.product_id = p2.product_id
    JOIN customers c ON o.customer_id = c.customer_id
    ${whereClause}
    GROUP BY p1.product_id, p2.product_id, p1.product_name, p2.product_name
    ORDER BY shared_orders DESC
    LIMIT 15
  `;

  db.all(query, args, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 13. Order Analysis & Frequency Gap
app.get('/api/order-frequency', (req, res) => {
  const { whereClause, args } = buildFilters(req.query);

  // Previous order dates, next order dates, and average order cycle
  const query = `
    WITH ordered_sales AS (
      SELECT
        o.customer_id,
        o.order_id,
        o.order_date,
        -- Previous order date for each customer
        LAG(o.order_date, 1) OVER (PARTITION BY o.customer_id ORDER BY o.order_date) AS prev_order_date
      FROM orders o
      JOIN order_items oi ON o.order_id = oi.order_id
      JOIN products p ON oi.product_id = p.product_id
      JOIN customers c ON o.customer_id = c.customer_id
      ${whereClause ? whereClause : ''}
      GROUP BY o.order_id, o.customer_id, o.order_date
    ),
    order_gaps AS (
      SELECT
        customer_id,
        order_id,
        order_date,
        prev_order_date,
        julianday(order_date) - julianday(prev_order_date) AS days_gap
      FROM ordered_sales
      WHERE prev_order_date IS NOT NULL
    )
    SELECT
      days_gap,
      COUNT(order_id) AS order_count
    FROM order_gaps
    GROUP BY days_gap
    ORDER BY days_gap
  `;

  db.all(query, args, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Compute total average gap
    const totalGapsQuery = `
      WITH ordered_sales AS (
        SELECT
          o.customer_id,
          o.order_id,
          o.order_date,
          LAG(o.order_date, 1) OVER (PARTITION BY o.customer_id ORDER BY o.order_date) AS prev_order_date
        FROM orders o
        JOIN order_items oi ON o.order_id = oi.order_id
        JOIN products p ON oi.product_id = p.product_id
        JOIN customers c ON o.customer_id = c.customer_id
        ${whereClause ? whereClause : ''}
        GROUP BY o.order_id, o.customer_id, o.order_date
      ),
      order_gaps AS (
        SELECT
          julianday(order_date) - julianday(prev_order_date) AS days_gap
        FROM ordered_sales
        WHERE prev_order_date IS NOT NULL
      )
      SELECT
        COUNT(*) AS total_consecutive_gaps,
        AVG(days_gap) AS average_gap_days
      FROM order_gaps
    `;

    db.get(totalGapsQuery, args, (err, summaryRow) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        gapsDistribution: rows,
        averageGapDays: summaryRow.average_gap_days || 0.0,
        totalGapsCount: summaryRow.total_consecutive_gaps || 0
      });
    });
  });
});

// 14. Order Summary List Endpoint (For Order Table)
app.get('/api/orders-list', (req, res) => {
  const { whereClause, args } = buildFilters(req.query);

  const query = `
    SELECT
      o.order_id,
      o.order_date,
      o.customer_id,
      c.customer_name,
      c.city AS customer_city,
      o.order_status,
      COUNT(oi.order_item_id) AS unique_item_count,
      SUM(oi.quantity) AS total_quantity,
      SUM(oi.quantity * oi.unit_price) AS gross_booking_value,
      SUM(CASE WHEN o.order_status = 'Delivered' THEN oi.quantity * oi.unit_price ELSE 0.0 END) AS recognized_revenue,
      SUM(CASE WHEN o.order_status IN ('Delivered', 'Pending') THEN oi.quantity * oi.unit_price ELSE 0.0 END) AS net_pipeline_value
    FROM orders o
    JOIN customers c ON o.customer_id = c.customer_id
    LEFT JOIN order_items oi ON o.order_id = oi.order_id
    LEFT JOIN products p ON oi.product_id = p.product_id
    ${whereClause}
    GROUP BY o.order_id, o.order_date, o.customer_id, c.customer_name, c.city, o.order_status
    ORDER BY o.order_date DESC, o.order_id DESC
  `;

  db.all(query, args, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 15. New Customer Acquisition by Month
app.get('/api/acquisition', (req, res) => {
  const { whereClause, args } = buildFilters(req.query);

  // We use customer registration (signup_date) or first purchase date.
  // Let's implement both, clearly labeled in UI:
  // 1. Signups by Month (Registration date from customers table)
  // 2. First Purchases by Month (First order date from orders table)
  const signupQuery = `
    SELECT
      strftime('%Y-%m', signup_date) AS month,
      COUNT(customer_id) AS new_signups
    FROM customers
    WHERE signup_date IS NOT NULL
    GROUP BY strftime('%Y-%m', signup_date)
    ORDER BY month
  `;

  const firstPurchaseQuery = `
    WITH first_orders AS (
      SELECT
        o.customer_id,
        MIN(o.order_date) AS first_order_date
      FROM orders o
      JOIN order_items oi ON o.order_id = oi.order_id
      JOIN products p ON oi.product_id = p.product_id
      JOIN customers c ON o.customer_id = c.customer_id
      ${whereClause}
      GROUP BY o.customer_id
    )
    SELECT
      strftime('%Y-%m', first_order_date) AS month,
      COUNT(customer_id) AS first_time_buyers
    FROM first_orders
    GROUP BY strftime('%Y-%m', first_order_date)
    ORDER BY month
  `;

  db.all(signupQuery, [], (err, signupRows) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(firstPurchaseQuery, args, (err, purchaseRows) => {
      if (err) return res.status(500).json({ error: err.message });

      res.json({
        signups: signupRows,
        firstPurchases: purchaseRows
      });
    });
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Express Analytics Server running on http://localhost:${PORT}`);
});
