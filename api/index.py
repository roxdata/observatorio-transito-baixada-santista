import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from fastapi import Request
from app_web.main import app, home

@app.middleware('http')
async def fix_vercel_path(request: Request, call_next):
    path = request.scope.get('path', '')
    for prefix in ['/api/index.py', '/api/index']:
        if path == prefix:
            request.scope['path'] = '/'
            break
        elif path.startswith(prefix + '/'):
            request.scope['path'] = path[len(prefix):]
            break
    return await call_next(request)

app.add_api_route('/api/index.py', home, methods=['GET'])
app.add_api_route('/api/index', home, methods=['GET'])
app.add_api_route('/api', home, methods=['GET'])
