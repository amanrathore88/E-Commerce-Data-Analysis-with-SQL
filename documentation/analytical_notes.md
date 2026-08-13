# Analytical Notes & Performance Optimization

This document details the database performance tuning, indexing strategies, and dialect portability configurations applied to this project.

---

## 1. Dialect Portability Reference

While **PostgreSQL** is our secondary compliance check, **MySQL 8.x** is the primary execution environment for MySQL Workbench. Below is the reference mapping showing how specific dialect differences are handled:

| SQL Operation | MySQL (Primary Execution) | PostgreSQL (Secondary) | SQLite (Automated testing) |
| :--- | :--- | :--- | :--- |
| **Date Formatting** | `DATE_FORMAT(date, '%Y-%m')` | `TO_CHAR(date, 'YYYY-MM')` | `strftime('%Y-%m', date)` |
| **Date Extraction** | `YEAR(date)` / `MONTH(date)` | `EXTRACT(YEAR FROM date)` | `strftime('%Y', date)` |
| **Date Intervals** | `DATE_SUB(date, INTERVAL 90 DAY)` | `date - INTERVAL '90 days'` | `date(date, '-90 days')` |
| **Date Differences** | `DATEDIFF(date2, date1)` | `(date2 - date1)` | `julianday(date2) - julianday(date1)` |
| **String Cast Concat** | `CONCAT(r, f, m)` | `(r::text || f::text || m::text)` | `(CAST(r AS TEXT) || CAST(f AS TEXT)...)` |
| **String Aggregation** | `GROUP_CONCAT(col SEPARATOR ', ')` | `STRING_AGG(col, ', ')` | `group_concat(col, ', ')` |

To maximize portability, we used `CASE WHEN` inside standard aggregates for conditional summation rather than PostgreSQL-specific `FILTER (WHERE ...)` syntax.

---

## 2. Query Performance & Indexing Strategy

In a large production environment, scanning whole tables for aggregations or joins degrades performance. We recommend the following indexes to optimize execution plans:

### A. Customer Joins & Time Boundaries
```sql
-- Optimize customer filters and signup timelines
CREATE INDEX idx_customers_signup ON customers(signup_date);
CREATE INDEX idx_customers_city ON customers(city);
```

### B. Order Headers
```sql
-- Optimize customer purchase lookups and date aggregations
CREATE INDEX idx_orders_customer_date ON orders(customer_id, order_date);
CREATE INDEX idx_orders_status ON orders(order_status);
```

### C. Order Line Items
```sql
-- Optimize order item sums and product sales aggregations
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
```

### Rationale
- Indexing `orders(customer_id, order_date)` speeds up the `LAG()` and `LEAD()` partitioning windows by avoiding sorting passes.
- Indexing `order_items(order_id)` and `order_items(product_id)` speeds up hash joins during query execution.

---

## 3. CTE vs. Temporary Views & Performance

- **CTEs**: We utilized CTEs extensively for query structure. In PostgreSQL 12+ and MySQL 8.0+, CTEs are automatically inlined by the planner, meaning they carry no performance penalty compared to raw subqueries, while being significantly easier to maintain.
- **Views**: Creating permanent analytical database objects (views) like `vw_customer_summary` is recommended for reporting. It centralizes logic so that business analysts do not write inconsistent joins, reducing query errors.
- **Materialized Views**: In a production database with millions of rows, we would recommend converting the RFM and Customer summaries into **Materialized Views** refreshed on a daily cron schedule, avoiding computing window functions on every query.
