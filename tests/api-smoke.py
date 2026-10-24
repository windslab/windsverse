"""Smoke test for local disposable preview only; never run against production."""
import json,urllib.request,urllib.error,http.cookiejar,uuid,datetime,concurrent.futures
base='http://127.0.0.1:5173'
jar=http.cookiejar.CookieJar(); client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def request(path='/api/cafe',data=None,origin=base,anonymous=False):
 headers={'Origin':origin,'Content-Type':'application/json'}
 req=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers=headers)
 try:
  r=(urllib.request.build_opener() if anonymous else client).open(req);return r.status,json.load(r)
 except urllib.error.HTTPError as e:
  raw=e.read().decode()
  try:return e.code,json.loads(raw)
  except ValueError:return e.code,{'error':raw}
def state():
 code,d=request();assert code==200,d;return d
def action(a,p={},revision=None,key=None):
 return request(data={'action':a,'payload':p,'revision':state()['revision'] if revision is None else revision,'key':key or str(uuid.uuid4())})
assert request(anonymous=True)[0]==401
code,d=request('/api/auth',{'action':'login','loginId':'local.owner','pin':'59482716'});assert code==200,d
assert request(data={'action':'note.add'},origin='https://untrusted.example')[0]==403
if not state()['state']['products']:assert action('demo')[0]==200
key=str(uuid.uuid4());rev=state()['revision'];payload={'text':'Catatan pemeriksaan lokal '+str(uuid.uuid4()),'color':'green'}
assert action('note.add',payload,rev,key)[0]==200
assert action('note.add',payload,rev,key)[0]==200
assert len([n for n in state()['state']['notes'] if n['text']==payload['text']])==1
assert action('note.add',{'text':'Usang','color':'blue'},rev)[0]==409
with concurrent.futures.ThreadPoolExecutor(2) as pool:
 rev=state()['revision']
 results=list(pool.map(lambda n:action('note.add',{'text':'Bersamaan '+str(n),'color':'yellow'},rev)[0],range(2)))
assert sorted(results)==[200,409],results
s=state()['state'];now=datetime.datetime.now(datetime.timezone.utc)
if not any(sh['status']=='open' for sh in s['shifts']):
 shift={'name':'Shift pratinjau lokal','startAt':(now-datetime.timedelta(minutes=15)).isoformat(),'endAt':(now+datetime.timedelta(hours=3)).isoformat(),'employeeIds':['owner']}
 code,d=action('save',{'kind':'shifts','data':shift});assert code==200,d
 sid=d['result']['id'];assert action('shift.open',{'id':sid})[0]==200;assert action('attendance.in',{'shiftId':sid})[0]==200
else:sid=next(sh['id'] for sh in s['shifts'] if sh['status']=='open')
s=state()['state'];pid=s['products'][0]['id'];before=next(i['stock'] for i in s['ingredients'] if i['name']=='Biji kopi')
code,d=action('order.create',{'shiftId':sid,'items':[{'productId':pid,'quantity':1}],'paid':True,'cashPaid':100000,'paymentMethod':'tunai','orderType':'takeaway','discount':0,'taxEnabled':True});assert code==200,d
o=d['result'];assert o['total']==27500 and o['hpp']==7240,o
assert action('order.status',{'id':o['id'],'status':'sedang_dibuat'})[0]==200
code,public=request('/api/public');assert code==200 and 'employees' not in public and 'orders' not in public
assert 'hpp' not in json.dumps(public)
print('PASS: anonymous auth, CSRF, ID/PIN login, catalog, idempotency, stale revision, concurrent write protection, roster, attendance, canonical pricing, HPP, stock, order progression, public privacy.')
print('Local demonstration data only. Production database remains untouched.')
