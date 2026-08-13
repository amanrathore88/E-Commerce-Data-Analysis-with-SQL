# Data Dictionary

This document details the schema of the e-commerce database, identifying the tables, column types, constraints, and structural relationships.

---

## Entity Relationship Summary
The database consists of 4 main tables forming a standard e-commerce transactional star schema:

```text
  customers (customer_id)
      │
      └───1:N───> orders (order_id)
                    │
                    └───1:N───> order_items (order_item_id)
                                  │
                                  └───N:1───> products (product_id)
```

---

## 1. Table: `customers`
Represents the customer registry. It tracks customer registrations, signup locations, and demographic attributes.
- **Grain**: One row per unique customer profile.
- **Total Records**: 90

| Column Name | Data Type | Key / Constraint | Description |
| :--- | :--- | :--- | :--- |
| `customer_id` | `INT` | Primary Key | Unique identifier for each customer. |
| `customer_name` | `VARCHAR(100)` | Not Null | Full name of the customer. Note: Names are not unique. |
| `city` | `VARCHAR(50)` | Not Null | Signup city (e.g., Delhi, Mumbai, Pune, Kolkata). |
| `gender` | `VARCHAR(10)` | Not Null | Gender of the customer (Male, Female). |
| `signup_date` | `DATE` | Not Null | Date of customer registration. |

---

## 2. Table: `products`
Represents the product catalog master. Tracks product descriptions, catalog categories, and prices.
- **Grain**: One row per unique product (SKU).
- **Total Records**: 38

| Column Name | Data Type | Key / Constraint | Description |
| :--- | :--- | :--- | :--- |
| `product_id` | `INT` | Primary Key | Unique identifier for each product. |
| `product_name` | `VARCHAR(100)` | Not Null | Name of the product (e.g., Smartphone X12). |
| `category` | `VARCHAR(50)` | Not Null | Product vertical (e.g., Electronics, Clothing). |
| `unit_price` | `NUMERIC(10,2)` | Not Null, > 0 | Catalog price of a single unit of the product. |

---

## 3. Table: `orders`
Represents the transactional order headers. Tracks order placement, customer links, dates, and order status.
- **Grain**: One row per unique order transaction.
- **Total Records**: 2,000

| Column Name | Data Type | Key / Constraint | Description |
| :--- | :--- | :--- | :--- |
| `order_id` | `INT` | Primary Key | Unique identifier for each transaction. |
| `customer_id` | `INT` | Foreign Key | References `customers(customer_id)`. Links order to customer. |
| `order_date` | `DATE` | Not Null | Date the order was placed. |
| `order_status` | `VARCHAR(20)` | Not Null | Status of the order (Delivered, Pending, Cancelled). |

---

## 4. Table: `order_items`
Represents order line items. Tracks the specific products inside an order, their quantity, and the unit price at transaction.
- **Grain**: One row per product line item within an order.
- **Total Records**: 4,967

| Column Name | Data Type | Key / Constraint | Description |
| :--- | :--- | :--- | :--- |
| `order_item_id` | `INT` | Primary Key | Unique identifier for each order line item. |
| `order_id` | `INT` | Foreign Key | References `orders(order_id)`. Links line item to the order header. |
| `product_id` | `INT` | Foreign Key | References `products(product_id)`. Links line item to the product catalog. |
| `quantity` | `INT` | Not Null, > 0 | Number of units purchased of this product. |
| `unit_price` | `NUMERIC(10,2)` | Not Null, > 0 | Actual transaction unit price of the item. |
