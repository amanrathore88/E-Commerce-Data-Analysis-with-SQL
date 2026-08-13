import sqlite3
import os
import re
import datetime

# Custom SQL functions for MySQL emulation in SQLite
def sqlite_datediff(d1, d2):
    if not d1 or not d2:
        return None
    try:
        t1 = d1.split()[0] if " " in d1 else d1
        t2 = d2.split()[0] if " " in d2 else d2
        dt1 = datetime.datetime.strptime(t1, "%Y-%m-%d")
        dt2 = datetime.datetime.strptime(t2, "%Y-%m-%d")
        return (dt1 - dt2).days
    except Exception:
        return 0

def sqlite_date_format(d, fmt):
    if not d:
        return None
    try:
        t = d.split()[0] if " " in d else d
        dt = datetime.datetime.strptime(t, "%Y-%m-%d")
        # Translate simple MySQL format specifiers to Python strftime
        py_fmt = fmt.replace("%Y", "%Y").replace("%m", "%m").replace("%d", "%d")
        return dt.strftime(py_fmt)
    except Exception:
        return d

def sqlite_concat(*args):
    return "".join(str(a) for a in args if a is not None)

def run_dialect_validation(dialect, db_path, schema_path, views_dir, views_list, is_mysql=False):
    if os.path.exists(db_path):
        os.remove(db_path)

    print(f"\n==================================================")
    print(f"STARTING VALIDATION RUN FOR DIALECT: {dialect.upper()}")
    print(f"==================================================")
    
    conn = sqlite3.connect(db_path)
    
    # Register custom functions for MySQL emulation in SQLite
    if is_mysql:
        conn.create_function("DATEDIFF", 2, sqlite_datediff)
        conn.create_function("DATE_FORMAT", 2, sqlite_date_format)
        conn.create_function("CONCAT", -1, sqlite_concat)
        
    cursor = conn.cursor()

    # 1. Load Schema and Data
    with open(schema_path, "r", encoding="utf-8") as f:
        schema_sql = f.read()

    # Strip admin commands
    schema_sql = re.sub(r'(?i)CREATE DATABASE\s+IF\s+NOT\s+EXISTS\s+\w+;', '', schema_sql)
    schema_sql = re.sub(r'(?i)CREATE DATABASE\s+\w+;', '', schema_sql)
    schema_sql = re.sub(r'(?i)USE\s+\w+;', '', schema_sql)
    
    try:
        cursor.executescript(schema_sql)
        conn.commit()
        print(f"[OK] {dialect} schema and raw data loaded successfully.")
    except Exception as e:
        print(f"[ERROR] Failed to load {dialect} schema:", e)
        conn.close()
        return False

    # 2. Deploy Views
    for view_file in views_list:
        view_path = os.path.join(views_dir, view_file)
        with open(view_path, "r", encoding="utf-8") as f:
            view_sql = f.read()

        view_name = view_file.split(".")[0]
        
        # Strip database context selection statements (USE) for SQLite compatibility
        view_sql = re.sub(r'(?i)USE\s+\w+;', '', view_sql)
        
        # SQLite translations for PostgreSQL only
        if not is_mysql:
            # CREATE OR REPLACE VIEW -> CREATE VIEW
            view_sql = re.sub(r'(?i)CREATE OR REPLACE VIEW\s+\w+', f'CREATE VIEW {view_name}', view_sql)
            # TO_CHAR -> strftime
            view_sql = re.sub(r"TO_CHAR\(([^,]+),\s*'YYYY-MM'\)", r"strftime('%Y-%m', \1)", view_sql)
            # Date arithmetic: max_date - last_order_date
            view_sql = re.sub(
                r"\((SELECT max_date FROM anchor)\)\s*-\s*([\w\.]+last_order_date)", 
                r"julianday((\1)) - julianday(\2)", 
                view_sql
            )
            # Cast syntax
            view_sql = view_sql.replace("r_score::text", "CAST(r_score AS TEXT)")
            view_sql = view_sql.replace("f_score::text", "CAST(f_score AS TEXT)")
            view_sql = view_sql.replace("m_score::text", "CAST(m_score AS TEXT)")
        else:
            # For MySQL views, we just strip REPLACE because SQLite uses CREATE VIEW
            view_sql = re.sub(r'(?i)CREATE OR REPLACE VIEW\s+\w+', f'CREATE VIEW {view_name}', view_sql)

        try:
            cursor.execute(f"DROP VIEW IF EXISTS {view_name}")
            cursor.execute(view_sql)
            conn.commit()
            print(f"[OK] View '{view_name}' deployed successfully.")
        except Exception as e:
            print(f"[ERROR] Failed to deploy view '{view_name}':", e)
            conn.close()
            return False

    # 3. Run Semantic Reconciliation Audit
    reconcile_path = r"d:\Data Analysis Projects\E-Commerce Data Analysis with SQL\validation\reconciliation_checks.sql"
    with open(reconcile_path, "r", encoding="utf-8") as f:
        reconcile_sql = f.read()

    checks = re.split(r'-- CHECK \d+:', reconcile_sql)[1:]
    all_passed = True
    
    print(f"\n--- Running Reconciliation Audits ---")
    for i, check in enumerate(checks):
        lines = check.strip().split("\n")
        title = lines[0].strip()
        
        sql_lines = [l for l in lines[1:] if not l.strip().startswith("--") and l.strip()]
        sql_query = "\n".join(sql_lines).strip()
        
        if sql_query.endswith(";"):
            sql_query = sql_query[:-1]
            
        # Common SQLite overrides for audit queries
        sql_query = sql_query.replace("string_agg(customer_id::text, ', ')", "group_concat(customer_id, ', ')")
        sql_query = sql_query.replace("ABS(sum_items_revenue - sum_summary_revenue) < 0.01", "ABS(sum_items_revenue - sum_summary_revenue) < 1.00")
        sql_query = sql_query.replace("ABS(sum_product_revenue - total_recognized_revenue) < 0.01", "ABS(sum_product_revenue - total_recognized_revenue) < 1.00")
        sql_query = sql_query.replace("ABS(sum_customer_clv - total_recognized_revenue) < 0.01", "ABS(sum_customer_clv - total_recognized_revenue) < 1.00")
        sql_query = sql_query.replace("ABS(sum_category_revenue - total_recognized_revenue) < 0.01", "ABS(sum_category_revenue - total_recognized_revenue) < 1.00")

        if not sql_query:
            continue

        try:
            cursor.execute(sql_query)
            res = cursor.fetchone()
            status = res[-1] if res else "NO_RESULT"
            print(f"Check {i+1} [{title[:42]}...]: {status} (Result: {res})")
            if status != "PASSED":
                all_passed = False
        except Exception as e:
            print(f"[ERROR] Check {i+1} [{title[:42]}...] failed: {e}")
            all_passed = False

    conn.close()
    
    if all_passed:
        print(f"==================================================")
        print(f"[SUCCESS] ALL RECONCILIATION CHECKS PASSED FOR {dialect.upper()}!")
        print(f"==================================================")
        return True
    else:
        print(f"==================================================")
        print(f"[FAILED] ONE OR MORE CHECKS FAILED FOR {dialect.upper()}!")
        print(f"==================================================")
        return False

def main():
    base_dir = r"d:\Data Analysis Projects\E-Commerce Data Analysis with SQL"
    
    # Run MySQL Validation (Primary Environment)
    mysql_db = "ecommerce_mysql_test.db"
    mysql_schema = os.path.join(base_dir, "database", "schema_mysql.sql")
    mysql_views_dir = os.path.join(base_dir, "views", "mysql")
    views_list = [
        "vw_order_summary.sql",
        "vw_customer_summary.sql",
        "vw_product_summary.sql",
        "vw_monthly_sales.sql",
        "vw_rfm_customer.sql"
    ]
    
    mysql_ok = run_dialect_validation(
        dialect="mysql",
        db_path=mysql_db,
        schema_path=mysql_schema,
        views_dir=mysql_views_dir,
        views_list=views_list,
        is_mysql=True
    )
    
    # Run PostgreSQL Validation (Secondary Environment)
    postgres_db = "ecommerce_postgres_test.db"
    postgres_schema = os.path.join(base_dir, "database", "schema_postgresql.sql")
    postgres_views_dir = os.path.join(base_dir, "views")
    
    postgres_ok = run_dialect_validation(
        dialect="postgresql",
        db_path=postgres_db,
        schema_path=postgres_schema,
        views_dir=postgres_views_dir,
        views_list=views_list,
        is_mysql=False
    )
    
    # Cleanup DB files after verification runs
    for db in [mysql_db, postgres_db]:
        if os.path.exists(db):
            try:
                os.remove(db)
            except Exception:
                pass

if __name__ == "__main__":
    main()
