-- ============================================================================
-- SQL File: sql/mysql_dialect_overrides.sql
-- Scope: MySQL Workbench Syntax Overrides for specific queries (Q9, Q13, Q26, Q34, Q37, Q51)
-- Dialect: MySQL 8.x
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q09 (01_basic_business_metrics.sql)
-- Change: TO_CHAR() date formatting replaced with DATE_FORMAT()
-- ----------------------------------------------------------------------------
SELECT 
    DATE_FORMAT(o.order_date, '%Y-%m') AS order_month,
    SUM(oi.quantity * oi.unit_price) AS monthly_revenue,
    COUNT(DISTINCT o.order_id) AS monthly_order_count
FROM order_items oi
JOIN orders o ON oi.order_id = o.order_id
WHERE o.order_status = 'Delivered'
GROUP BY DATE_FORMAT(o.order_date, '%Y-%m')
ORDER BY order_month;


-- ----------------------------------------------------------------------------
-- Q13 (03_customer_analysis.sql)
-- Change: Split previously active buyers from never-purchased customers dynamically.
-- ----------------------------------------------------------------------------

-- Query 1: Previously Active Buyers who are now inactive (last purchase > 90 days ago)
WITH anchor AS (
    SELECT MAX(order_date) AS max_date FROM orders
)
SELECT 
    customer_id,
    customer_name,
    last_order_date,
    days_since_last_order
FROM vw_customer_summary
WHERE days_since_last_order > 90
ORDER BY days_since_last_order DESC;

-- Query 2: Registered customers who have never purchased
SELECT 
    customer_id,
    customer_name,
    signup_date
FROM vw_customer_summary
WHERE total_orders = 0
ORDER BY signup_date;


-- ----------------------------------------------------------------------------
-- Q26 (05_window_functions.sql)
-- Change: Direct subtraction (-) replaced with DATEDIFF()
-- ----------------------------------------------------------------------------
WITH order_lead AS (
    SELECT 
        customer_id,
        customer_name,
        order_date,
        LEAD(order_date, 1) OVER (
            PARTITION BY customer_id 
            ORDER BY order_date, order_id
        ) AS next_order_date
    FROM vw_order_summary
    WHERE order_status = 'Delivered'
)
SELECT 
    customer_id,
    customer_name,
    order_date AS first_purchase,
    next_order_date AS second_purchase,
    DATEDIFF(next_order_date, order_date) AS days_between_orders
FROM order_lead
WHERE next_order_date IS NOT NULL
ORDER BY customer_id, order_date;


-- ----------------------------------------------------------------------------
-- Q34 (08_churn_retention.sql - Advanced Cohort Retention Supplement)
-- Change: TO_CHAR() and EXTRACT(YEAR/MONTH) replaced with MySQL equivalents
-- ----------------------------------------------------------------------------
WITH cohort_sizes AS (
    SELECT 
        DATE_FORMAT(signup_date, '%Y-%m') AS cohort_month,
        COUNT(customer_id) AS cohort_size
    FROM customers
    GROUP BY DATE_FORMAT(signup_date, '%Y-%m')
),
customer_order_months AS (
    SELECT DISTINCT 
        o.customer_id,
        DATE_FORMAT(c.signup_date, '%Y-%m') AS cohort_month,
        (YEAR(o.order_date) - YEAR(c.signup_date)) * 12 + (MONTH(o.order_date) - MONTH(c.signup_date)) AS month_index
    FROM orders o
    JOIN customers c ON o.customer_id = c.customer_id
    WHERE o.order_status = 'Delivered'
)
SELECT 
    cs.cohort_month,
    cs.cohort_size,
    COUNT(DISTINCT CASE WHEN com.month_index = 0 THEN com.customer_id END) AS m0_active_count,
    ROUND(COUNT(DISTINCT CASE WHEN com.month_index = 0 THEN com.customer_id END) * 100.0 / cs.cohort_size, 1) AS m0_retention_pct,
    COUNT(DISTINCT CASE WHEN com.month_index = 1 THEN com.customer_id END) AS m1_active_count,
    ROUND(COUNT(DISTINCT CASE WHEN com.month_index = 1 THEN com.customer_id END) * 100.0 / cs.cohort_size, 1) AS m1_retention_pct,
    COUNT(DISTINCT CASE WHEN com.month_index = 2 THEN com.customer_id END) AS m2_active_count,
    ROUND(COUNT(DISTINCT CASE WHEN com.month_index = 2 THEN com.customer_id END) * 100.0 / cs.cohort_size, 1) AS m2_retention_pct,
    COUNT(DISTINCT CASE WHEN com.month_index >= 3 THEN com.customer_id END) AS m3_plus_active_count,
    ROUND(COUNT(DISTINCT CASE WHEN com.month_index >= 3 THEN com.customer_id END) * 100.0 / cs.cohort_size, 1) AS m3_plus_retention_pct
FROM cohort_sizes cs
LEFT JOIN customer_order_months com ON cs.cohort_month = com.cohort_month
GROUP BY cs.cohort_month, cs.cohort_size
ORDER BY cs.cohort_month;


-- ----------------------------------------------------------------------------
-- Q37 (05_window_functions.sql)
-- Change: Direct subtraction (-) replaced with DATEDIFF()
-- ----------------------------------------------------------------------------
WITH order_intervals AS (
    SELECT 
        customer_id,
        order_date,
        LAG(order_date, 1) OVER (
            PARTITION BY customer_id 
            ORDER BY order_date
        ) AS prev_order_date
    FROM vw_order_summary
    WHERE order_status = 'Delivered'
),
gaps AS (
    SELECT 
        DATEDIFF(order_date, prev_order_date) AS days_diff
    FROM order_intervals
    WHERE prev_order_date IS NOT NULL
)
SELECT ROUND(AVG(days_diff), 2) AS average_days_between_orders
FROM gaps;


-- ----------------------------------------------------------------------------
-- Q51 (04_time_series_analysis.sql)
-- Change: TO_CHAR() date formatting replaced with DATE_FORMAT()
-- ----------------------------------------------------------------------------
SELECT 
    DATE_FORMAT(signup_date, '%Y-%m') AS signup_month,
    COUNT(customer_id) AS new_customers_acquired
FROM customers
GROUP BY DATE_FORMAT(signup_date, '%Y-%m')
ORDER BY signup_month;
