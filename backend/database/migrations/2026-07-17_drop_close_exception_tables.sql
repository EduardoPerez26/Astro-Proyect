SET NAMES utf8mb4;

-- Close Center and Exception Center were removed from the product; these
-- tables are no longer read or written by the application.
DROP TABLE IF EXISTS corporate_close_tasks;
DROP TABLE IF EXISTS corporate_close_periods;
DROP TABLE IF EXISTS corporate_exceptions;
