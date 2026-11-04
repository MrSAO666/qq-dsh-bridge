import ast, asyncio, json, pathlib, types

source = (pathlib.Path(__file__).resolve().parents[1] / 'vendor/bilibili-mcp/mcp_server.py').read_text(encoding='utf-8')
node = next(x for x in ast.parse(source).body if isinstance(x, ast.AsyncFunctionDef) and x.name == 'bili_reply')
node.decorator_list = []
seen = {}
class Video:
    def __init__(self, **kw): pass
    async def get_info(self): return {'aid': 42}
class User:
    def __init__(self, uid, **kw): self.uid = uid
    async def get_user_info(self): return {'name': '小明'}
class Api:
    def __init__(self, **kw): pass
    def update_data(self, **data):
        seen.update(data)
        async def result(): return {'rpid': 123}
        self.result = result()
        return self
async def state(*a): return 'ok'
scope = {'os': types.SimpleNamespace(environ={}), 'json': json, 'get_cred': lambda: object(),
         'video': types.SimpleNamespace(Video=Video), 'user': types.SimpleNamespace(User=User),
         'comment': types.SimpleNamespace(CommentResourceType=types.SimpleNamespace(VIDEO=types.SimpleNamespace(value=1)),
                   Api=Api, API={'comment': {'send': {}}}), '_comment_state': state, '_guard_log': lambda x: None}
exec(compile(ast.fix_missing_locations(ast.Module(body=[node], type_ignores=[])), '<test>', 'exec'), scope)
result = json.loads(asyncio.run(scope['bili_reply']('BV1abcdefgh1', '这条不错', 8, 5, [123])))
assert result['success'] and seen['message'] == '这条不错 @小明'
assert json.loads(seen['at_name_to_mid']) == {'小明': 123}
assert (seen['oid'], seen['root'], seen['parent']) == (42, 5, 8)
print('评论真实 @ 参数构造测试通过')
