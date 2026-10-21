import unittest,tempfile,os,sys,threading,json,urllib.request,urllib.error,http.cookiejar
sys.path.insert(0,os.path.dirname(os.path.dirname(__file__)))
import server
class API(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory(); server.DB=cls.tmp.name+'/test.db';os.environ['ADMIN_PASSWORD']='test-password-12345';server.initialize()
  cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);threading.Thread(target=cls.http.serve_forever,daemon=True).start();cls.base='http://127.0.0.1:'+str(cls.http.server_port)+'/api/'
 @classmethod
 def tearDownClass(cls):cls.http.shutdown();cls.http.server_close();cls.tmp.cleanup()
 def client(self):return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 def call(self,c,path,method='GET',data=None):
  req=urllib.request.Request(self.base+path,data=json.dumps(data).encode() if data is not None else None,method=method,headers={'Content-Type':'application/json'})
  try:
   with c.open(req) as r:return r.status,json.load(r)
  except urllib.error.HTTPError as e:return e.code,json.load(e)
 def admin(self):
  c=self.client();self.assertEqual(self.call(c,'login','POST',{'email':'admin@example.com','password':'test-password-12345'})[0],200);return c
 def test_auth_and_validation(self):
  c=self.client();self.assertEqual(self.call(c,'bootstrap')[0],401);self.assertEqual(self.call(c,'login','POST',{'email':'admin@example.com','password':'wrong'})[0],401)
  c=self.admin();self.assertEqual(self.call(c,'campaigns','POST',{'name':'Test','seat':'MCA','county':'Makueni'})[0],400)
 def test_six_seats_and_records(self):
  c=self.admin()
  for seat in server.SEATS:
   code,camp=self.call(c,'campaigns','POST',{'name':'Test '+seat,'seat':seat,'county':'Makueni','constituency':'Kaiti','ward':'Ukia','budget':10000,'running_mate':'Deputy'})
   self.assertEqual(code,201); cid=camp['id']
   self.assertEqual(self.call(c,f'campaigns/{cid}/finance','POST',{'title':'Fuel','type':'Expense','amount':-1})[0],400)
   self.assertEqual(self.call(c,f'campaigns/{cid}/tasks','POST',{'title':'Venue booking','status':'Open'})[0],200)
   tasks=self.call(c,f'campaigns/{cid}/tasks')[1]; self.assertEqual(len(tasks),1)
   self.assertEqual(self.call(c,f'campaigns/{cid}/tasks/{tasks[0]["id"]}','PATCH',{'title':'Venue booked','status':'Done'})[0],200)
   self.assertEqual(self.call(c,f'campaigns/{cid}/tasks/{tasks[0]["id"]}','DELETE')[0],200)
   self.assertEqual(self.call(c,f'campaigns/{cid}/messages','POST',{'title':'Update','status':'Delivered'})[0],200)
   self.assertEqual(self.call(c,f'campaigns/{cid}/messages')[1][0]['status'],'Draft')
   self.assertGreater(len(self.call(c,f'campaigns/{cid}/audit')[1]),0)
 def test_roles_and_isolation(self):
  admin=self.admin();cid=self.call(admin,'campaigns','POST',{'name':'Isolation','seat':'President'})[1]['id'];other=self.call(admin,'campaigns','POST',{'name':'Other','seat':'President'})[1]['id']
  with server.connect() as db:
   salt='ab'*16;db.execute('INSERT INTO users VALUES(?,?,?,?,?,?)',('viewer','viewer@example.com','Viewer','viewer',salt,server.password_hash('viewer-password',salt)));db.execute('INSERT INTO access VALUES(?,?)',('viewer',cid))
  v=self.client();self.call(v,'login','POST',{'email':'viewer@example.com','password':'viewer-password'})
  self.assertEqual(len(self.call(v,'bootstrap')[1]['campaigns']),1)
  self.assertEqual(self.call(v,f'campaigns/{other}/tasks')[0],403)
  self.assertEqual(self.call(v,f'campaigns/{cid}/tasks','POST',{'title':'Forbidden'})[0],403)
  self.assertEqual(self.call(v,f'campaigns/{cid}/audit')[0],403)
  self.call(v,'logout','POST',{});self.assertEqual(self.call(v,'bootstrap')[0],401)
if __name__=='__main__':unittest.main()
