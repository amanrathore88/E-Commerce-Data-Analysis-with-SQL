-- ============================================================================
-- SQL File: sql/03_customer_analysis.sql
-- Scope: Questions 8, 11, 12, 13, 19, 21, 27, 30, 31, 43
-- Dialect: PostgreSQL (Canonical)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q08 & Q43: Who are our top 5/10 most valuable customers?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: We leverage the pre-aggregated `vw_customer_summary` view to sort 
-- customer lifetime spend (recognized revenue only). Ranks are calculated via 
-- DENSE_RANK() to prevent skipping positions in case of financial ties.
SELECT 
    customer_id,
    customer_name,
    city,
    historical_clv,
    DENSE_RANK() OVER (ORDER BY historical_clv DESC) AS vip_rank
FROM vw_customer_summary
ORDER BY historical_clv DESC
LIMIT 10;


-- ----------------------------------------------------------------------------
-- Q11: Which customers purchase repeatedly?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Selects customers with delivered order counts > 1. 
-- In our dataset, this returns 80 customers, indicating that 100% of customers 
-- who place a first order eventually buy a second time.
SELECT 
    customer_id,
    customer_name,
    delivered_orders
FROM vw_customer_summary
WHERE delivered_orders > 1
ORDER BY delivered_orders DESC;


-- ----------------------------------------------------------------------------
-- Q12: Which customers have never placed an order?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Isolate cold signups. In standard relational design, we check 
-- for customers that lack corresponding records in the orders table.
SELECT 
    customer_id,
    customer_name,
    city,
    signup_date
FROM customers
WHERE customer_id NOT IN (SELECT DISTINCT customer_id FROM orders)
ORDER BY signup_date;


-- ----------------------------------------------------------------------------
-- Q13: Which customers have been inactive in the last 90 days?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: We separate the cold registered base into two distinct operational groups:
-- 1. Cold Buyers (Previously active but inactive in the last 90 days)
--    - Strategy: Retention/win-back campaign based on their previous purchases.
-- 2. Never-Purchased (Signups with zero historical purchases)
--    - Strategy: Funnel activation campaign (welcome coupon, onboarding).
-- The analysis date is anchored dynamically to MAX(order_date) to keep queries active.

-- Query 1: Cold Buyers (Last purchase > 90 days ago)
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

-- Query 2: Never-Purchased (Signups with zero transactions)
SELECT 
    customer_id,
    customer_name,
    signup_date
FROM vw_customer_summary
WHERE total_orders = 0
ORDER BY signup_date;


-- ----------------------------------------------------------------------------
-- Q19: Which customers have the highest average order value?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: AOV at the customer level is sensitive to low order volume. 
-- Customers with only 2-3 high-ticket transactions (like Riya Joshi: AOV 98k) 
-- rank above our highest lifetime spent VIPs.
SELECT 
    customer_id,
    customer_name,
    delivered_orders,
    historical_clv,
    average_order_value_recognized AS customer_aov
FROM vw_customer_summary
WHERE delivered_orders > 0
ORDER BY customer_aov DESC
LIMIT 5;


-- ----------------------------------------------------------------------------
-- Q21: How are customers ranked based on revenue?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Dense ranking of the entire active customer cohort by CLV.
SELECT 
    customer_id,
    customer_name,
    historical_clv,
    DENSE_RANK() OVER (ORDER BY historical_clv DESC) AS customer_revenue_rank
FROM vw_customer_summary
ORDER BY customer_revenue_rank;


-- ----------------------------------------------------------------------------
-- Q27: Who are the top 3 customers by revenue?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Displays the top three highest recognized LTV buyers.
SELECT 
    customer_id,
    customer_name,
    historical_clv
FROM vw_customer_summary
ORDER BY historical_clv DESC
LIMIT 3;


-- ----------------------------------------------------------------------------
-- Q30: What was each customer's highest-value order?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: We use ROW_NUMBER() partitioned by customer_id to extract the single 
-- largest delivered order total. Tells us the maximum spend ceiling per customer.
WITH order_ranks AS (
    SELECT 
        customer_id,
        order_id,
        order_date,
        recognized_revenue AS order_value,
        ROW_NUMBER() OVER (
            PARTITION BY customer_id 
            ORDER BY recognized_revenue DESC, order_date ASC
        ) AS rn
    FROM vw_order_summary
    WHERE order_status = 'Delivered'
)
SELECT 
    c.customer_id,
    c.customer_name,
    ork.order_id,
    ork.order_date,
    ork.order_value
FROM order_ranks ork
JOIN customers c ON ork.customer_id = c.customer_id
WHERE ork.rn = 1
ORDER BY ork.order_value DESC;


-- ----------------------------------------------------------------------------
-- Q31: What is each customer's lifetime value (CLV)?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Refers strictly to historical customer recognized revenue. 
-- Never-purchased users correctly evaluate to 0.00.
SELECT 
    customer_id,
    customer_name,
    historical_clv AS historical_customer_lifetime_value
FROM vw_customer_summary
ORDER BY historical_customer_lifetime_value DESC;
