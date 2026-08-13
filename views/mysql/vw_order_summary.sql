-- ============================================================================
-- View: vw_order_summary (MySQL Version)
-- Grain: Order Level (one row per order_id)
-- Purpose: Aggregates order item counts, quantities, gross value, 
--          and recognized revenue for each transaction.
-- ============================================================================
CREATE OR REPLACE VIEW vw_order_summary AS
SELECT 
    o.order_id,
    o.customer_id,
    c.customer_name,
    c.city AS customer_city,
    c.gender AS customer_gender,
    o.order_date,
    o.order_status,
    COUNT(oi.order_item_id) AS unique_item_count,
    COALESCE(SUM(oi.quantity), 0) AS total_quantity,
    COALESCE(SUM(oi.quantity * oi.unit_price), 0.00) AS gross_booking_value,
    CASE 
        WHEN o.order_status = 'Delivered' THEN COALESCE(SUM(oi.quantity * oi.unit_price), 0.00)
        ELSE 0.00
    END AS recognized_revenue,
    CASE 
        WHEN o.order_status IN ('Delivered', 'Pending') THEN COALESCE(SUM(oi.quantity * oi.unit_price), 0.00)
        ELSE 0.00
    END AS net_pipeline_value
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
LEFT JOIN order_items oi ON o.order_id = oi.order_id
GROUP BY 
    o.order_id, 
    o.customer_id, 
    c.customer_name, 
    c.city, 
    c.gender, 
    o.order_date, 
    o.order_status;
