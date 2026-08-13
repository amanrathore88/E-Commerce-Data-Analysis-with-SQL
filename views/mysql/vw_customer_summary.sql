-- ============================================================================
-- View: vw_customer_summary (MySQL Version)
-- Grain: Customer Level (one row per customer_id)
-- Purpose: Consolidates order frequency, signup dates, and lifetime spend using DATEDIFF.
-- ============================================================================
CREATE OR REPLACE VIEW vw_customer_summary AS
WITH customer_orders AS (
    SELECT 
        customer_id,
        COUNT(order_id) AS total_orders,
        COUNT(CASE WHEN order_status = 'Delivered' THEN order_id END) AS delivered_orders,
        COUNT(CASE WHEN order_status = 'Cancelled' THEN order_id END) AS cancelled_orders,
        MIN(order_date) AS first_order_date,
        MAX(order_date) AS last_order_date,
        SUM(gross_booking_value) AS gross_spend,
        SUM(recognized_revenue) AS recognized_spend,
        SUM(net_pipeline_value) AS net_spend
    FROM vw_order_summary
    GROUP BY customer_id
),
anchor AS (
    SELECT MAX(order_date) AS max_date FROM orders
)
SELECT 
    c.customer_id,
    c.customer_name,
    c.city,
    c.gender,
    c.signup_date,
    COALESCE(co.total_orders, 0) AS total_orders,
    COALESCE(co.delivered_orders, 0) AS delivered_orders,
    COALESCE(co.cancelled_orders, 0) AS cancelled_orders,
    COALESCE(co.gross_spend, 0.00) AS total_gross_spend,
    COALESCE(co.recognized_spend, 0.00) AS historical_clv,
    COALESCE(co.net_spend, 0.00) AS total_net_spend,
    CASE 
        WHEN COALESCE(co.delivered_orders, 0) > 0 THEN COALESCE(co.recognized_spend, 0.00) / co.delivered_orders
        ELSE 0.00
    END AS average_order_value_recognized,
    co.first_order_date,
    co.last_order_date,
    CASE 
        WHEN co.last_order_date IS NOT NULL THEN DATEDIFF((SELECT max_date FROM anchor), co.last_order_date)
        ELSE NULL
    END AS days_since_last_order,
    CASE 
        WHEN co.total_orders IS NULL OR co.total_orders = 0 THEN 'Never-Purchased'
        WHEN co.delivered_orders = 0 THEN 'No Delivered Orders'
        WHEN co.delivered_orders = 1 THEN 'One-Time Buyer'
        ELSE 'Repeat Purchaser'
    END AS purchasing_cohort
FROM customers c
LEFT JOIN customer_orders co ON c.customer_id = co.customer_id;
