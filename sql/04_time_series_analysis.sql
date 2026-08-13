-- ============================================================================
-- SQL File: sql/04_time_series_analysis.sql
-- Scope: Questions 9, 23, 29, 41, 50, 51
-- Dialect: PostgreSQL (Canonical)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q09 & Q50: How has our revenue trended month by month and which month had the highest revenue?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Pulls monthly unique orders and recognized revenue. July 2026 was 
-- the peak month, generating 4,150,073.00, driven by the overall sales scale.
SELECT 
    month,
    recognized_revenue AS monthly_revenue,
    delivered_orders AS monthly_delivered_orders,
    DENSE_RANK() OVER (ORDER BY recognized_revenue DESC) AS monthly_sales_rank
FROM vw_monthly_sales
ORDER BY month;


-- ----------------------------------------------------------------------------
-- Q23: How has our revenue accumulated over time — running total?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Computes cumulative running totals daily. To optimize performance, 
-- we aggregate recognized revenue to the day grain before applying the window function.
WITH daily_sales AS (
    SELECT 
        order_date,
        SUM(recognized_revenue) AS daily_revenue
    FROM vw_order_summary
    WHERE order_status = 'Delivered'
    GROUP BY order_date
)
SELECT 
    order_date,
    daily_revenue,
    SUM(daily_revenue) OVER (
        ORDER BY order_date 
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_running_total
FROM daily_sales
ORDER BY order_date;


-- ----------------------------------------------------------------------------
-- Q29: What is the month-over-month revenue growth?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: We use LAG() to pull the preceding month's revenue. First-period 
-- MoM growth evaluates to NULL since there is no prior baseline to divide against.
SELECT 
    month,
    recognized_revenue AS current_month_revenue,
    previous_month_revenue,
    mom_revenue_growth_pct
FROM vw_monthly_sales
ORDER BY month;


-- ----------------------------------------------------------------------------
-- Q41: What is the daily sales trend?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Daily unique order count and recognized revenue, ordered chronologically.
SELECT 
    order_date,
    COUNT(DISTINCT order_id) AS total_orders,
    SUM(recognized_revenue) AS total_daily_revenue
FROM vw_order_summary
GROUP BY order_date
ORDER BY order_date;


-- ----------------------------------------------------------------------------
-- Q51: How many new customers were acquired each month?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Customer acquisition timeline based on registry signup_date. 
-- In our dataset, signups show steady monthly volume (1 to 6 new users), indicating 
-- that our massive transaction growth is driven by existing customer frequency 
-- rather than new customer signups.
SELECT 
    TO_CHAR(signup_date, 'YYYY-MM') AS signup_month,
    COUNT(customer_id) AS new_customers_acquired
FROM customers
GROUP BY TO_CHAR(signup_date, 'YYYY-MM')
ORDER BY signup_month;
