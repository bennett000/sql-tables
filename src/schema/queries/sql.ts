import { toString } from '@ch1/utility';
import { QueryFn } from '../../interfaces';
import { pluckRows } from '../../table';

export interface InfoSchemaTable {
  table_name: string
}

export const listTables = (
  dbName: string,
  query: QueryFn<InfoSchemaTable>,
) => query(`
  SELECT table_name 
    FROM information_schema.tables 
    WHERE table_type = 'BASE TABLE' 
      AND table_schema = 'public' 
      AND table_catalog = $1
    ORDER BY table_type, table_name
`, [dbName]).then(pluckRows);


export interface InfoSchemaColumn {
  column_name: string;
  table_name: string;
  data_type: string;
  character_maximum_length: number;
  is_nullable: string;
  numeric_precision: number;
}

export const listColumns = (
  dbName: string,
  query: QueryFn<InfoSchemaColumn>,
  table: string,
) => query(`
  SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name   = $2
`, [dbName, toString(table)])
.then(pluckRows);

export const listAllColumns:
  (dbName: string, query: QueryFn<InfoSchemaColumn>) => Promise<InfoSchemaColumn[]> =
  (dbName: string, query: QueryFn<InfoSchemaColumn>) => query(`
  SELECT column_name, table_name, data_type, character_maximum_length, 
    is_nullable, numeric_precision
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_catalog = $1
`, [dbName]).then(pluckRows);

export const createTable:
  (
    query: QueryFn<any>,
    tableName: string,
    columnsAndConstraints: string[]
  ) => Promise<any[]> =
 /** note I don't feel great about not escaping this :/ but it's not supported */
  (
    query: QueryFn<any>,
    tableName: string,
    columnsAndConstraints: string[]
  ) => {
    const q =
      `CREATE TABLE ${tableName} (${columnsAndConstraints.join(', ').trim()});`;
    return query(q).then(pluckRows);
};


export const varChar = (size: number) => `varchar(${size})`;

export const foreignKey = (
  column: string, key: string
) => `REFERENCES ${column} (${key})`;

export const unique = (columns: string[]) => `UNIQUE(${columns.join(', ')})`;

export const primaryKey = (columns: string[]) =>
  `PRIMARY KEY(${columns.join(', ')})`;

export const foreignKeyComposite =
  (columns: string[], references: string[], otherTable: string) => {
  if (columns.length !== references.length) {
    throw new Error('foreignKeyComposite column/reference mismatch');
  }

  return `FOREIGN KEY (${columns.join(', ')}) REFERENCES ${otherTable} ` +
    `(${references.join(', ')})`;
};

export const alterTable = (table: string): string => `ALTER TABLE ${table}`;

export const addColumn = (table: string): string => `${alterTable(table)} ADD COLUMN`;

export const alterColumn =
  (table: string, column: string) =>
    `${alterTable(table)} ALTER COLUMN ${column}`;

export const setNull = (table: string, column: string) =>
  `${alterColumn(table, column)} DROP NOT NULL`;

export const setNotNull = (table: string, column: string) =>
  `${alterColumn(table, column)} SET NOT NULL`;
