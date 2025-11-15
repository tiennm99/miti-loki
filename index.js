// Cloudflare Worker to forward logs to Grafana Cloud Loki

async function handleRequest(request, env) {
  const url = new URL(request.url);

  // Redirect to GitHub repo for documentation
  if (request.method === 'GET') {
    return Response.redirect('https://github.com/tiennnm99/miti-loki', 302);
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
    // Read the request body as plain text
    const message = await request.text();

    // Validate that body is not empty
    if (!message) {
      return new Response('Request body is required', {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // Create Loki payload from plain text message
    const lokiPayload = {
      streams: [
        {
          stream: {
            source: 'miti-loki'
          },
          values: [
            [(Date.now() * 1000000).toString(), message]
          ]
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
