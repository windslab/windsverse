"""Integration checks against the disposable localhost preview, never production.
The credentials below are local fixtures, not production accounts.
"""
import json, urllib.request, urllib.error, http.cookiejar, uuid, concurrent.futures
BASE='http://127.0.0.1:5173'
OWNER_PIN='59482716'
def client():return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
anon,owner,staff,other=client(),client(),client(),client()
def req(c,path='/api/auth',data=None,origin=BASE):
 r=urllib.request.Request(BASE+path,data=json.dumps(data).encode() if data is not None else None,headers={'Origin':origin,'Content-Type':'application/json'})
 try:
  with c.open(r) as response:return response.status,json.load(response),response.headers
 except urllib.error.HTTPError as e:
  try:return e.code,json.load(e),e.headers
  except ValueError:return e.code,{},e.headers

def ok(result,code=200):assert result[0]==code,result[:2];return result[1]
def login(c,id,pin):return req(c,data={'action':'login','loginId':id,'pin':pin})
def state(c=owner):return ok(req(c,'/api/cafe'))
def action(a,p,c=owner):return req(c,'/api/cafe',{'action':a,'payload':p,'revision':state(c)['revision'],'key':str(uuid.uuid4())})
def creds(eid,id,pin=OWNER_PIN,current=OWNER_PIN):return req(owner,data={'action':'credentials','employeeId':eid,'loginId':id,'pin':pin,'currentPin':current})

ok(req(anon,'/api/cafe'),401)
ok(req(anon,'/api/auth?accounts=1'),401)
ok(req(anon,data={'action':'activate','loginId':'attacker','pin':OWNER_PIN}),403)
owner.open(BASE+'/signin-with-chatgpt?return_to=/').read()
status=ok(req(owner))
if status['canActivate']:
 ok(req(owner,data={'action':'activate','loginId':'local.owner','pin':'11111111'}),400)
 ok(req(owner,data={'action':'activate','loginId':'local.owner','pin':OWNER_PIN}))
else:ok(login(owner,'local.owner',OWNER_PIN))
ok(req(owner,data={'action':'activate','loginId':'owner.again','pin':OWNER_PIN}),403)
assert state()['actor']['role']=='admin'
# A separate browser with no ChatGPT session can authenticate as the owner.
response=login(other,'LOCAL.OWNER',OWNER_PIN);ok(response)
assert 'HttpOnly' in response[2]['Set-Cookie'] and 'SameSite=Strict' in response[2]['Set-Cookie']
assert state(other)['actor']['employeeId']=='owner'
ok(req(anon,data={'action':'login','loginId':'local.owner','pin':OWNER_PIN},origin='https://untrusted.example'),403)
# Staff creation has no email requirement.
short=uuid.uuid4().hex[:8]
employee={'name':'Local auth check '+short,'role':'karyawan','status':'aktif','phone':'','joinedAt':'2026-10-09'}
eid=ok(action('save',{'kind':'employees','data':employee}))['result']['id']
ok(creds(eid,'staff.'+short,current='94726381'),403)
ok(creds(eid,'local.owner'),409)
ok(creds(eid,'staff.'+short,pin='12345678'),400)
ok(creds(eid,'staff.'+short))
ok(login(staff,'staff.'+short,OWNER_PIN))
s=state(staff);assert s['actor']['role']=='karyawan'
assert not s['state']['expenses'] and not s['state']['tiers']
ok(req(staff,'/api/auth?accounts=1'),403)
ok(req(staff,data={'action':'credentials','employeeId':'owner','loginId':'hijack','pin':OWNER_PIN,'currentPin':OWNER_PIN}),403)
ok(action('save',{'kind':'employees','data':employee},staff),403)
for payload in [ok(req(owner,'/api/auth?accounts=1')),state(),s]:
 dump=json.dumps(payload);assert 'pin_hash' not in dump and OWNER_PIN not in dump and 'token_hash' not in dump
# Reset invalidates an already authenticated device and the previous PIN.
new_pin='82745916'
ok(creds(eid,'staff.'+short,pin=new_pin));ok(req(staff,'/api/cafe'),401)
ok(login(staff,'staff.'+short,OWNER_PIN),401);ok(login(staff,'staff.'+short,new_pin))
ok(req(owner,data={'action':'revoke','employeeId':eid,'currentPin':OWNER_PIN}))
ok(req(staff,'/api/cafe'),401);ok(login(staff,'staff.'+short,new_pin),401)
ok(creds(eid,'staff.'+short))
ok(login(staff,'staff.'+short,OWNER_PIN))
ok(action('save',{'kind':'employees','id':eid,'data':{**employee,'status':'nonaktif'}}))
ok(req(staff,'/api/cafe'),401);ok(login(staff,'staff.'+short,OWNER_PIN),401)
ok(action('save',{'kind':'employees','id':eid,'data':employee}))
# Reactivating employment does not silently reactivate old credentials.
ok(login(staff,'staff.'+short,OWNER_PIN),401);ok(creds(eid,'staff.'+short))
ok(login(staff,'staff.'+short,OWNER_PIN))
ok(req(staff,data={'action':'logout'}));ok(req(staff,'/api/cafe'),401)
# Admin can reset their own PIN; every existing owner session must end.
ok(creds('owner','local.owner'))
ok(req(owner,'/api/cafe'),401);ok(req(other,'/api/cafe'),401)
ok(login(owner,'local.owner',OWNER_PIN))
# Parallel guesses for one ID are limited, including in-flight requests.
unknown='unknown.'+short
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 codes=list(pool.map(lambda _:login(client(),unknown,'94726381')[0],range(8)))
assert codes.count(401)==5 and codes.count(429)==3,codes
ok(req(owner,data={'action':'logout'}));ok(req(owner,'/api/cafe'),401)
print('PASS: owner-only activation, PIN validation, no-email staff, independent browser login, role enforcement, CSRF, secret redaction, PIN reset, revocation, deactivation, logout, multi-device invalidation, atomic concurrent login throttling.')
