-- ============================================================================
-- View: vw_monthly_sales (PostgreSQL Version)
-- Grain: Monthly Level (one row per month string)
-- Purpose: Measures monthly sales trajectory and MoM growth velocity.
-- ============================================================================
CREATE OR REPLACE VIEW vw_monthly_sales AS
WITH monthly_metrics AS (
    SELECT 
        TO_CHAR(order_date, 'YYYY-MM') AS month_str,
        COUNT(DISTINCT order_id) AS total_orders,
        COUNT(DISTINCT CASE WHEN order_status = 'Delivered' THEN order_id END) AS delivered_orders,
        COUNT(DISTINCT customer_id) AS active_customers,
        SUM(gross_booking_value) AS gross_booking_value,
        SUM(recognized_revenue) AS recognized_revenue
    FROM vw_order_summary
    GROUP BY TO_CHAR(order_date, 'YYYY-MM')
),
growth_calc AS (
    SELECT 
        month_str,
        total_orders,
        delivered_orders,
        active_customers,
        gross_booking_value,
        recognized_revenue,
        LAG(recognized_revenue, 1) OVER (ORDER BY month_str) AS previous_month_revenue
    FROM monthly_metrics
)
SELECT 
    month_str AS month,
    total_orders,
    delivered_orders,
    active_customers,
    gross_booking_value,
    recognized_revenue,
    previous_month_revenue,
    CASE 
        WHEN previous_month_revenue IS NULL OR previous_month_revenue = 0 THEN NULL
        ELSE ROUND(((recognized_revenue - previous_month_revenue) * 100.0 / previous_month_revenue), 2)
    END AS mom_revenue_growth_pct
FROM growth_calc;
