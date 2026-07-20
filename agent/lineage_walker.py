import os
import sys
from datahub.ingestion.graph.client import DataHubGraph, DataHubGraphConfig

# Why we use GraphQL (via DataHubGraph) instead of the get_lineage_paths_between MCP tool directly:
# Calling an MCP tool programmatically from Python requires spinning up the MCP server as a subprocess,
# managing JSON-RPC over stdio, handling initialization, and parsing the tool response. This is
# genuinely not workable/maintainable for a lightweight script when the DataHub Python SDK already
# provides `DataHubGraph.execute_graphql()`. This method naturally uses the DATAHUB_GMS_TOKEN for auth
# and executes the exact same `searchAcrossLineage` GraphQL query that the MCP tool itself uses under the hood.

def get_lineage_paths_between(source_urn: str, target_urns: list[str]) -> dict:
    """
    Retrieves lineage paths upstream from source_urn using DataHubGraph's execute_graphql.
    Filters paths to only those terminating at one of the target_urns.
    Returns a dictionary mapping target_urn to its path from source_urn.
    """
    # Initialize DataHubGraph (uses DATAHUB_GMS_URL and DATAHUB_GMS_TOKEN env vars natively)
    gms_url = os.environ.get("DATAHUB_GMS_URL", "http://localhost:8080")
    gms_token = os.environ.get("DATAHUB_GMS_TOKEN", "")
    
    graph = DataHubGraph(DataHubGraphConfig(server=gms_url, token=gms_token))

    query = '''
    query getLineage($input: SearchAcrossLineageInput!) {
      searchAcrossLineage(input: $input) {
        searchResults {
          entity {
            urn
          }
          paths {
            path {
              urn
            }
          }
        }
      }
    }
    '''
    
    variables = {
        'input': {
            'urn': source_urn,
            'direction': 'UPSTREAM',
            'query': '*'
        }
    }
    
    data = graph.execute_graphql(query, variables)
    
    if 'errors' in data:
        raise Exception(f"GraphQL errors: {data['errors']}")
        
    results = data.get('searchAcrossLineage', {}).get('searchResults', [])
    
    # Filter and map paths to the target URNs
    paths_found = {}
    for result in results:
        entity_urn = result['entity']['urn']
        if entity_urn in target_urns:
            # Get the first path that reaches this entity
            if result.get('paths') and len(result['paths']) > 0:
                path_nodes = [node['urn'] for node in result['paths'][0]['path']]
                paths_found[entity_urn] = path_nodes
                
    return paths_found

if __name__ == "__main__":
    churn_model_urn = "urn:li:mlModel:(urn:li:dataPlatform:custom,churn_model,PROD)"
    target_urns = [
        "urn:li:dataset:(urn:li:dataPlatform:custom,raw_transactions,PROD)",
        "urn:li:dataset:(urn:li:dataPlatform:custom,raw_customer_profile,PROD)",
        "urn:li:dataset:(urn:li:dataPlatform:custom,raw_support_tickets,PROD)"
    ]
    
    print(f"Walking upstream lineage from {churn_model_urn}...")
    paths = get_lineage_paths_between(churn_model_urn, target_urns)
    
    for target, path in paths.items():
        print(f"\nPath to {target.split(',')[1]}:")
        # Reverse path so it shows upstream -> downstream
        print(" -> ".join([node.split(',')[1] for node in reversed(path)]))
