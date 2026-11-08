-- Guarda a qual cidade este banco pertence, para não misturar dados de cidades diferentes.
CREATE TABLE meta (
  chave text PRIMARY KEY,
  valor text NOT NULL
);
