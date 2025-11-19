import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;

async function main() {
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set.');
    process.exit(1);
  }

  const client = new Client({
    connectionString: connectionString,
  });

  try {
    await client.connect();
    console.log('Connected to the database.');

    const addColumnQuery = `
      ALTER TABLE boletas 
      ADD COLUMN IF NOT EXISTS image_url TEXT;

      COMMENT ON COLUMN boletas.image_url IS 'URL de la imagen de la boleta/recibo subida por el cliente';

      CREATE INDEX IF NOT EXISTS idx_boletas_image_url ON boletas(image_url) WHERE image_url IS NOT NULL;
    `;

    await client.query(addColumnQuery);
    console.log('Column image_url added to boletas table successfully.');

    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('Schema cache reload notification sent successfully.');

  } catch (error) {
    console.error('Error executing script:', error);
  } finally {
    await client.end();
    console.log('Disconnected from the database.');
  }
}

main();