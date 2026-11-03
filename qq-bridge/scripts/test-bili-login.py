import asyncio, importlib.util, json, os, tempfile
from pathlib import Path
from unittest.mock import patch

os.environ['BILI_MCP_TOOLS'] = 'bili_login,bili_login_check,bili_check_credential'
with tempfile.TemporaryDirectory() as d:
    os.environ['QQ_BILI_DATA_DIR'] = d
    p = Path(__file__).resolve().parents[1] / 'vendor/bilibili-mcp/mcp_server.py'
    spec = importlib.util.spec_from_file_location('bili_test', p)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    class Login: _QrCodeLogin__qr_key = 'fake-test-key'
    class Cookie:
        def __init__(self, value): self.value = value
    class Response:
        cookies = {'SESSDATA': Cookie('fake-session'), 'bili_jct': Cookie('fake-csrf'), 'DedeUserID': Cookie('123')}
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def json(self, **kw): return {'code': 0, 'data': {'code': 0, 'url': ''}}
    class Session:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        def get(self, *a, **kw): return Response()
    module._login_session = Login()
    with patch('aiohttp.ClientSession', Session):
        result = json.loads(asyncio.run(module.bili_login_check()))
    assert result['status'] == 'done'
    assert module.load_credential() is not None
    assert oct(Path(d, 'bili_credential.json').stat().st_mode & 0o777) == '0o600'
    Path(d, 'bili_credential.json').write_text('{"sessdata":"","bili_jct":"","dedeuserid":""}')
    assert module.load_credential() is None
    print('扫码登录：Cookie 回收与空凭据校验通过')
