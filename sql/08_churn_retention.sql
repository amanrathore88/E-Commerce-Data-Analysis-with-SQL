-- ============================================================================
-- SQL File: sql/08_churn_retention.sql
-- Scope: Questions 32, 34, 39, 45
-- Dialect: PostgreSQL (Canonical)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q32: What percentage of customers make repeat purchases?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Evaluates core buyer retention. We report this from two perspectives:
-- 1. Repeat rate of the active purchasing cohort (80 buyers) = 100.00%
-- 2. Repeat rate of the registered database (90 accounts) = 88.89%
WITH customer_orders AS (
    SELECT 
        customer_id,
        COUNT(order_id) AS delivered_orders_count
    FROM orders
    WHERE order_status = 'Delivered'
    GROUP BY customer_id
)
SELECT 
    COUNT(CASE WHEN delivered_orders_count > 1 THEN 1 END) AS repeat_buyers,
    COUNT(customer_id) AS active_purchasers,
    ROUND(
        COUNT(CASE WHEN delivered_orders_count > 1 THEN 1 END) * 100.0 / COUNT(customer_id), 
        2
    ) AS repeat_purchase_rate_active_cohort,
    (SELECT COUNT(*) FROM customers) AS total_registered,
    ROUND(
        COUNT(CASE WHEN delivered_orders_count > 1 THEN 1 END) * 100.0 / (SELECT COUNT(*) FROM customers), 
        2
    ) AS repeat_purchase_rate_registered_base
FROM customer_orders;


-- ----------------------------------------------------------------------------
-- Q34: How many customers were active each month — retention?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: There is a vital distinction between Monthly Active Users (MAU) 
-- and true Cohort Retention:
-- 1. Monthly Active Customers (Direct Answer to Q34)
--    - A simple count of unique purchasers transacting in a month. Shows overall 
--      business activity.
-- 2. Signup Cohort Retention Matrix (Advanced Supplementary Analysis)
--    - Groups users by their signup month and tracks what percentage transact 
--      over subsequent periods. Isolates onboarding friction from product stickiness.

-- Query 1: Monthly Active Customers (Direct Answer)
SELECT 
    month,
    active_customers AS monthly_active_purchasers
FROM vw_monthly_sales
ORDER BY month;

-- Query 2: Signup Cohort Retention Matrix (Advanced Supplement)
WITH cohort_sizes AS (
    SELECT 
        TO_CHAR(signup_date, 'YYYY-MM') AS cohort_month,
        COUNT(customer_id) AS cohort_size
    FROM customers
    GROUP BY TO_CHAR(signup_date, 'YYYY-MM')
),
customer_order_months AS (
    SELECT DISTINCT 
        o.customer_id,
        TO_CHAR(c.signup_date, 'YYYY-MM') AS cohort_month,
        (EXTRACT(YEAR FROM o.order_date) - EXTRACT(YEAR FROM c.signup_date)) * 12 + 
        (EXTRACT(MONTH FROM o.order_date) - EXTRACT(MONTH FROM c.signup_date)) AS month_index
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
-- Q39: Which customers are at risk of churn?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Churn risk tracks active buyers who have ceased orders for 
-- more than 120 days relative to the dynamic max date.
SELECT 
    customer_id,
    customer_name,
    last_order_date,
    days_since_last_order AS days_inactive
FROM vw_customer_summary
WHERE days_since_last_order > 120
ORDER BY days_inactive DESC;


-- ----------------------------------------------------------------------------
-- Q45: What is our customer churn rate?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Evaluates buyers churn (inactivity > 90 days of the ordering cohort = 10.0%) 
-- compared with database-wide inactive accounts (including never-purchased users = 20.0%).
WITH cohort_sizes AS (
    SELECT 
        COUNT(CASE WHEN days_since_last_order > 90 THEN 1 END) AS churned_buyers,
        COUNT(CASE WHEN last_order_date IS NOT NULL THEN 1 END) AS purchasing_cohort,
        COUNT(CASE WHEN days_since_last_order > 90 OR purchasing_cohort = 'Never-Purchased' THEN 1 END) AS inactive_registered,
        COUNT(customer_id) AS registered_cohort
    FROM vw_customer_summary
)
SELECT 
    churned_buyers,
    purchasing_cohort,
    ROUND((churned_buyers * 100.0 / purchasing_cohort), 2) AS active_customer_churn_rate_pct,
    inactive_registered,
    registered_cohort,
    ROUND((inactive_registered * 100.0 / registered_cohort), 2) AS registered_user_inactivity_rate_pct
FROM cohort_sizes;
