-- Verificar si usuarios.correo ya tiene restriccion UNIQUE
SELECT conname AS constraint_name
FROM pg_constraint
WHERE conrelid = 'usuarios'::regclass
  AND contype = 'u'
  AND conkey = ARRAY[
    (
      SELECT attnum
      FROM pg_attribute
      WHERE attrelid = 'usuarios'::regclass
        AND attname = 'correo'
    )
  ];

-- Si la consulta anterior no devuelve filas, ejecutar:
ALTER TABLE usuarios
ADD CONSTRAINT usuarios_correo_key UNIQUE (correo);
