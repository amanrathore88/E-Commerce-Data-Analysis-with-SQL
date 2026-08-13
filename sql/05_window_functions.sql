-- ============================================================================
-- SQL File: sql/05_window_functions.sql
-- Scope: Questions 24, 25, 26, 37
-- Dialect: PostgreSQL (Canonical)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q24: When was each customer's previous order placed?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: We use `LAG(order_date, 1)` partitioned by customer_id to extract 
-- the preceding order date. The first order for any customer will correctly return NULL.
SELECT 
    customer_id,
    customer_name,
    order_id,
    order_date AS current_order_date,
    LAG(order_date, 1) OVER (
        PARTITION BY customer_id 
        ORDER BY order_date, order_id
    ) AS previous_order_date
FROM vw_order_summary
ORDER BY customer_id, order_date;


-- ----------------------------------------------------------------------------
-- Q25: When was each customer's next order placed, if any?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: We use `LEAD(order_date, 1)` partitioned by customer_id. 
-- The latest order in each customer's timeline will evaluate to NULL, 
-- representing their current transaction endpoint.
SELECT 
    customer_id,
    customer_name,
    order_id,
    order_date AS current_order_date,
    LEAD(order_date, 1) OVER (
        PARTITION BY customer_id 
        ORDER BY order_date, order_id
    ) AS next_order_date
FROM vw_order_summary
ORDER BY customer_id, order_date;


-- ----------------------------------------------------------------------------
-- Q26: How many days are there between a customer's consecutive orders?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Calculates consecutive transaction intervals (in days). 
-- Cancelled orders are excluded to ensure we measure real product replenishment cycles.
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
    (next_order_date - order_date) AS days_between_orders
FROM order_lead
WHERE next_order_date IS NOT NULL
ORDER BY customer_id, order_date;


-- ----------------------------------------------------------------------------
-- Q37: On average, how many days pass between a customer's orders?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Computes the overall average replenishment interval. 
-- For our active purchasing cohort, this evaluates to 15.87 days (~16 days).
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
        (order_date - prev_order_date) AS days_diff
    FROM order_intervals
    WHERE prev_order_date IS NOT NULL
)
SELECT ROUND(AVG(days_diff), 2) AS average_days_between_orders
FROM gaps;
