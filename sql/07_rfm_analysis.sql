-- ============================================================================
-- SQL File: sql/07_rfm_analysis.sql
-- Scope: Question 40
-- Dialect: PostgreSQL (Canonical)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q40: How do customers look based on RFM analysis?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: We use NTILE(5) to score customers 1 to 5 on Recency, Frequency, 
-- and Monetary values. Never-purchased customers are excluded to ensure scoring 
-- is calculated strictly on the buying cohort (80 users). 
-- R scoring is reversed (6 - NTILE) so that a lower recency (recent purchase) 
-- receives the highest score (5).
SELECT 
    customer_segment,
    COUNT(customer_id) AS segment_size,
    ROUND(AVG(recency), 1) AS avg_recency_days,
    ROUND(AVG(frequency), 1) AS avg_frequency_orders,
    ROUND(AVG(monetary), 2) AS avg_monetary_clv,
    ROUND(COUNT(customer_id) * 100.0 / SUM(COUNT(customer_id)) OVER (), 2) AS pct_of_cohort
FROM vw_rfm_customer
GROUP BY customer_segment
ORDER BY avg_monetary_clv DESC;
