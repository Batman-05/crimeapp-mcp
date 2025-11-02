# MCP Server
The crimeapp-mcp-server folder contains the code to deploy the MCP server and its tools using Cloudflare workers.

The bindings for the MCP server/workers are defined in wrangler.local.jsonc, which is not synced for security reasons.

The information missing from the wrangler.jsonc are as follow:
	"secrets_store_secrets": [
		{
			"binding": "OPENAI_API_KEY", <- whatever name you want to call your binding
			"store_id": <your store ID>,
			"secret_name": "OPEN_API_KEY" <- the secret name in your Cloudflare secret store
		}
  	],
	"d1_databases": [
		{
			"binding": "CRIME_DB",
			"database_name": <your db name>,
			"database_id": <your db id>,
		}
	],


# Deployment
For now we dont have Cloudflare workers linked to github (it would run the new version after each push) so until then you need to manually `run npx wrangler deploy --config <your wrangler.local.jsonc>`. If you configured everything in wrangler.local then just run `npx wrangler deploy`    