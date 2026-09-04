BEGIN;

CREATE OR REPLACE FUNCTION teras_is_valid_resource_uri(candidate text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  uri_match text[];
  authority text;
  host_port text;
  host_match text[];
  host_value text;
  port_value integer;
  label text;
BEGIN
  IF candidate ~ '[[:space:]]' THEN
    RETURN false;
  END IF;

  uri_match := regexp_match(
    candidate,
    '^https?://([^/?#[:space:]]+)([/?#][^[:space:]]*)?$',
    'i'
  );
  IF uri_match IS NULL THEN
    RETURN false;
  END IF;

  authority := uri_match[1];
  host_port := regexp_replace(authority, '^.*@', '');
  IF host_port = '' THEN
    RETURN false;
  END IF;

  IF left(host_port, 1) = '[' THEN
    host_match := regexp_match(
      host_port,
      '^\[([0-9A-Fa-f:.]+)\](?::([0-9]{1,5}))?$'
    );
    IF host_match IS NULL
      OR NOT pg_input_is_valid(host_match[1], 'inet')
      OR family(host_match[1]::inet) <> 6 THEN
      RETURN false;
    END IF;
  ELSE
    host_match := regexp_match(host_port, '^([^:]+)(?::([0-9]{1,5}))?$');
    IF host_match IS NULL THEN
      RETURN false;
    END IF;

    host_value := host_match[1];
    IF host_value ~ '^[0-9.]+$' THEN
      IF NOT pg_input_is_valid(host_value, 'inet')
        OR family(host_value::inet) <> 4 THEN
        RETURN false;
      END IF;
    ELSE
      host_value := rtrim(host_value, '.');
      IF host_value = '' OR length(host_value) > 253 THEN
        RETURN false;
      END IF;
      FOREACH label IN ARRAY string_to_array(host_value, '.')
      LOOP
        IF length(label) > 63
          OR label !~ '^[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?$' THEN
          RETURN false;
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF host_match[2] IS NOT NULL THEN
    port_value := host_match[2]::integer;
    IF port_value > 65535 THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

DO $$
BEGIN
  IF to_regclass('teras_content_resources') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM teras_content_resources
    WHERE uri IS NOT NULL
      AND NOT teras_is_valid_resource_uri(uri)
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce resource URI policy: unsafe legacy values remain; run the resource URI quarantine first';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'teras_content_resources'::regclass
      AND conname = 'teras_content_resources_uri_http_check'
  ) THEN
    ALTER TABLE teras_content_resources
      ADD CONSTRAINT teras_content_resources_uri_http_check
      CHECK (uri IS NULL OR teras_is_valid_resource_uri(uri));
  END IF;
END $$;

COMMIT;