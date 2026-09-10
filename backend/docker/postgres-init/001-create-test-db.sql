-- Runs once, only on first container init (empty data volume). Creates the
-- separate test database so pytest never touches the dev database.
CREATE DATABASE digipramaan_test;
