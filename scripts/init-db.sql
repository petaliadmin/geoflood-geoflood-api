-- Initialize database with PostGIS extension and schemas

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS uuid-ossp;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create schemas
CREATE SCHEMA IF NOT EXISTS geoflood;
CREATE SCHEMA IF NOT EXISTS audit;

-- Set search path
SET search_path TO geoflood, public;

-- Grant privileges
GRANT USAGE ON SCHEMA geoflood TO public;
GRANT CREATE ON SCHEMA geoflood TO public;

-- Create audit log table
CREATE TABLE IF NOT EXISTS audit.logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    user_id UUID,
    old_values JSONB,
    new_values JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for audit logs
CREATE INDEX idx_audit_logs_table_operation ON audit.logs (table_name, operation);
CREATE INDEX idx_audit_logs_timestamp ON audit.logs (timestamp);
CREATE INDEX idx_audit_logs_user_id ON audit.logs (user_id);

-- Function for spatial indexing optimization
CREATE OR REPLACE FUNCTION geoflood.create_spatial_index(
    p_schema TEXT,
    p_table TEXT,
    p_column TEXT DEFAULT 'geom'
) RETURNS void AS $$
BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_%s_geom ON %I.%I USING gist(%I)', 
        p_table, p_column, p_schema, p_table, p_column);
END;
$$ LANGUAGE plpgsql;

-- Create audit trigger function
CREATE OR REPLACE FUNCTION audit.audit_trigger() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit.logs (table_name, operation, user_id, old_values, new_values) VALUES (
        TG_TABLE_NAME,
        TG_OP,
        COALESCE(current_setting('app.user_id', TRUE)::UUID, NULL),
        CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for schema
COMMENT ON SCHEMA geoflood IS 'Main GeoFlood application schema';
COMMENT ON SCHEMA audit IS 'Audit and logging schema';
