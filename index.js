// Cloudflare Worker to forward logs to Grafana Cloud Loki

async function handleRequest(request, env) {
  const url = new URL(request.url);

  // Redirect to GitHub repo for documentation
  if (request.method === 'GET') {
    return Response.redirect('https://github.com/tiennm99/miti-loki', 302);
  }

  // Only handle POST requests
  if (request.method !== 'POST') {
    return new Response('Method not allowed. Please use POST.', {
      status: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  // Validate environment variables
  if (!env.LOKI_HOST || !env.LOKI_USERNAME || !env.LOKI_PASSWORD) {
    return new Response('Server configuration error: Missing Loki credentials', {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  try {
    // Read and parse the request body
    const body = await request.text();

    // Validate that body is not empty
    if (!body) {
      return new Response('Request body is required', {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // Parse JSON body
    let data;
    try {
      data = JSON.parse(body);
    } catch (parseError) {
      return new Response(`Invalid JSON: ${parseError.message}`, {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // Convert single object to array
    const logs = Array.isArray(data) ? data : [data];

    // Validate and build log values array
    const values = [];
    for (const entry of logs) {
      // Validate message field is present
      if (!entry.message) {
        return new Response('Each log entry must have a "message" field', {
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
          }
        });
      }

      // Get timestamp (use provided or current time in nanoseconds)
      const timestamp = entry.timestamp || (Date.now() * 1000000).toString();

      // Validate and process metadata if present
      if (entry.metadata) {
        // Check that metadata is an object
        if (typeof entry.metadata !== 'object' || Array.isArray(entry.metadata)) {
          return new Response('Metadata must be an object', {
            status: 400,
            headers: {
              'Access-Control-Allow-Origin': '*',
            }
          });
        }

        // Validate metadata is flat (no nested objects)
        for (const [key, value] of Object.entries(entry.metadata)) {
          if (typeof value === 'object' && value !== null) {
            return new Response(`Metadata field "${key}" contains nested object. Only flat key-value pairs are allowed.`, {
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
              }
            });
          }
        }

        // Include metadata if it has properties
        if (Object.keys(entry.metadata).length > 0) {
          values.push([timestamp.toString(), entry.message, entry.metadata]);
        } else {
          values.push([timestamp.toString(), entry.message]);
        }
      } else {
        values.push([timestamp.toString(), entry.message]);
      }
    }

    // Get client IP from Cloudflare headers
    const clientIP = request.headers.get('CF-Connecting-IP') ||
                     request.headers.get('X-Forwarded-For') ||
                     'unknown';

    // Create Loki payload
    const lokiPayload = {
      streams: [
        {
          stream: {
            proxy: 'miti-loki',
            ip: clientIP
          },
          values: values
        }
      ]
    };

    // Construct Loki URL
    const lokiPort = env.LOKI_PORT || '443';
    const protocol = lokiPort === '443' ? 'https' : 'http';
    const lokiUrl = `${protocol}://${env.LOKI_HOST}:${lokiPort}/loki/api/v1/push`;

    // Create Basic Auth header
    const auth = btoa(`${env.LOKI_USERNAME}:${env.LOKI_PASSWORD}`);

    // Forward request to Loki
    const lokiResponse = await fetch(lokiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify(lokiPayload),
    });

    // Get response text
    const responseText = await lokiResponse.text();

    // Return the response from Loki with CORS headers
    return new Response(responseText, {
      status: lokiResponse.status,
      statusText: lokiResponse.statusText,
      headers: {
        'Content-Type': lokiResponse.headers.get('Content-Type') || 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    return new Response(`Error forwarding to Loki: ${error.message}`, {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

// Handle OPTIONS requests for CORS
function handleOptions(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };

  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// Main event listener for the worker
addEventListener('fetch', event => {
  const request = event.request;

  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    event.respondWith(handleOptions(request));
  } else {
    event.respondWith(handleRequest(request, event.env || {}));
  }
});

// Export for ES modules (newer Workers format)
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }
    return handleRequest(request, env);
  }
};
