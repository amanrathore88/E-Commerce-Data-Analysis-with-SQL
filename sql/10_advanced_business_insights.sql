-- ============================================================================
-- SQL File: sql/10_advanced_business_insights.sql
-- Scope: Questions 18, 38, 46, 47
-- Dialect: PostgreSQL (Canonical)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q18: Which orders are worth more than 10,000?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Identifies high-value orders. Because we query order_items directly, 
-- we must group by order_id and apply the filter inside a HAVING clause to prevent 
-- double-counting order totals.
SELECT 
    o.order_id,
    c.customer_name,
    o.order_date,
    o.order_status,
    SUM(oi.quantity * oi.unit_price) AS order_total_value
FROM order_items oi
JOIN orders o ON oi.order_id = o.order_id
JOIN customers c ON o.customer_id = c.customer_id
GROUP BY o.order_id, c.customer_name, o.order_date, o.order_status
HAVING SUM(oi.quantity * oi.unit_price) > 10000
ORDER BY order_total_value DESC;


-- ----------------------------------------------------------------------------
-- Q38: Which product category is growing the fastest?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: We compare recognized category revenues between 2025 and 2026. 
-- Clothing is the fastest growing category (+72.62%), but Electronics contributes 
-- the largest absolute dollar growth (+4.18M).
WITH category_yearly AS (
    SELECT 
        p.category, 
        EXTRACT(YEAR FROM o.order_date) AS order_year,
        SUM(oi.quantity * oi.unit_price) AS category_revenue
    FROM order_items oi
    JOIN products p ON oi.product_id = p.product_id
    JOIN orders o ON oi.order_id = o.order_id
    WHERE o.order_status = 'Delivered'
    GROUP BY p.category, EXTRACT(YEAR FROM o.order_date)
),
growth_calc AS (
    SELECT 
        c1.category,
        c1.category_revenue AS revenue_2025,
        c2.category_revenue AS revenue_2026,
        ROUND(
            ((c2.category_revenue - c1.category_revenue) * 100.0 / c1.category_revenue), 
            2
        ) AS growth_pct
    FROM category_yearly c1
    JOIN category_yearly c2 ON c1.category = c2.category 
        AND c1.order_year = 2025 
        AND c2.order_year = 2026
)
SELECT category, revenue_2025, revenue_2026, growth_pct
FROM growth_calc
ORDER BY growth_pct DESC;


-- ----------------------------------------------------------------------------
-- Q46 & Q47: What percentage of orders get cancelled and how many delivered vs cancelled?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Displays count and percentage shares of order statuses. 
-- Cancels represent 12.00% of all orders placed, and 12.71% of completed transactions.
WITH status_counts AS (
    SELECT 
        order_status,
        COUNT(order_id) AS order_count
    FROM orders
    GROUP BY order_status
),
totals AS (
    SELECT COUNT(*) AS grand_total FROM orders
)
SELECT 
    sc.order_status,
    sc.order_count,
    ROUND((sc.order_count * 100.0 / t.grand_total), 2) AS percentage_of_all_orders,
    CASE 
        WHEN sc.order_status IN ('Delivered', 'Cancelled') 
        THEN ROUND(
            (sc.order_count * 100.0 / 
            SUM(CASE WHEN sc.order_status IN ('Delivered', 'Cancelled') THEN sc.order_count ELSE 0 END) OVER ()), 
            2
        )
        ELSE NULL
    END AS percentage_of_completed_transactions
FROM status_counts sc, totals t
ORDER BY sc.order_count DESC;
