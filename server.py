"""Kenya Campaign Manager. Python 3.12+, no third-party runtime dependencies."""
import os, json, sqlite3, secrets, hashlib, hmac, time
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

ROOT = Path(__file__).parent
DB = os.getenv('DATABASE_PATH', str(ROOT / 'data' / 'campaigns.db'))
SEATS = {'President':'national','Governor':'county','Senator':'county','Woman Representative':'county','MP':'constituency','MCA':'ward'}
COUNTIES = 'Mombasa|Kwale|Kilifi|Tana River|Lamu|Taita Taveta|Garissa|Wajir|Mandera|Marsabit|Isiolo|Meru|Tharaka Nithi|Embu|Kitui|Machakos|Makueni|Nyandarua|Nyeri|Kirinyaga|Murang’a|Kiambu|Turkana|West Pokot|Samburu|Trans Nzoia|Uasin Gishu|Elgeyo Marakwet|Nandi|Baringo|Laikipia|Nakuru|Narok|Kajiado|Kericho|Bomet|Kakamega|Vihiga|Bungoma|Busia|Siaya|Kisumu|Homa Bay|Migori|Kisii|Nyamira|Nairobi'.split('|')
KINDS = {'tasks','events','volunteers','finance','reports','messages','nominations','resources'}
def connect():
    con = sqlite3.connect(DB); con.row_factory = sqlite3.Row; con.execute('PRAGMA foreign_keys=ON'); return con

def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()

def initialize():
    Path(DB).parent.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        c.executescript('''CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,role TEXT,salt TEXT,password TEXT);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires REAL);
        CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY,name TEXT,seat TEXT,county TEXT,constituency TEXT,ward TEXT,party TEXT,running_mate TEXT,budget REAL);
        CREATE TABLE IF NOT EXISTS access(user_id TEXT REFERENCES users(id),campaign_id TEXT REFERENCES campaigns(id),PRIMARY KEY(user_id,campaign_id));
        CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,campaign_id TEXT REFERENCES campaigns(id),kind TEXT,data TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor TEXT,action TEXT,campaign_id TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);''')
        if not c.execute('SELECT 1 FROM users').fetchone():
            pw = os.getenv('ADMIN_PASSWORD')
            if not pw or len(pw) < 12: raise RuntimeError('Set ADMIN_PASSWORD to at least 12 characters before first startup.')
            salt = secrets.token_hex(16)
            c.execute('INSERT INTO users VALUES(?,?,?,?,?,?)', ('admin',os.getenv('ADMIN_EMAIL','admin@example.com').lower(),'Workspace admin','admin',salt,password_hash(pw,salt)))

class Handler(BaseHTTPRequestHandler):
    def respond(self, status, data):
        body = json.dumps(data).encode(); self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff'); self.end_headers(); self.wfile.write(body)
    def user(self,c):
        cookie = self.headers.get('Cookie',''); token = next((p.strip()[8:] for p in cookie.split(';') if p.strip().startswith('session=')), '')
        return c.execute('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?',(token,time.time())).fetchone()
    def do_GET(self):
        if self.path.startswith('/api/'):
            return self.api('GET')
        path = urlparse(self.path).path
        if path not in ('/','/app.js','/style.css'): return self.respond(404,{'error':'Not found'})
        file = ROOT/'public'/({'/':'index.html'}.get(path,path[1:])); body = file.read_bytes()
        self.send_response(200); self.send_header('Content-Type',{'html':'text/html','js':'text/javascript','css':'text/css'}[file.suffix[1:]]); self.send_header('X-Content-Type-Options','nosniff'); self.send_header('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'"); self.end_headers(); self.wfile.write(body)
    def do_POST(self): self.api('POST')
    def do_PATCH(self): self.api('PATCH')
    def do_DELETE(self): self.api('DELETE')
    def api(self,method):
        try:
            if method != 'GET' and self.headers.get('Sec-Fetch-Site') == 'cross-site': return self.respond(403,{'error':'Cross-site request blocked'})
            size = int(self.headers.get('Content-Length',0))
            if size > 100000: return self.respond(413,{'error':'Request too large'})
            data = json.loads(self.rfile.read(size) or '{}') if method != 'GET' else {}
            if not isinstance(data,dict): raise ValueError('Expected an object')
            path = urlparse(self.path).path.split('/')[2:]
            with connect() as c:
                if path == ['login'] and method == 'POST':
                    # Slow repeated password guesses on this dependency-free server.
                    time.sleep(.3)
                    u = c.execute('SELECT * FROM users WHERE email=?',(str(data.get('email','')).lower(),)).fetchone()
                    if not u or not hmac.compare_digest(password_hash(str(data.get('password','')),u['salt']),u['password']): return self.respond(401,{'error':'Invalid email or password'})
                    token=secrets.token_urlsafe(32); c.execute('INSERT INTO sessions VALUES(?,?,?)',(token,u['id'],time.time()+28800)); c.commit()
                    self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Set-Cookie',f'session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'+ ('; Secure' if os.getenv('SECURE_COOKIES')=='1' else '')); self.end_headers(); self.wfile.write(b'{}'); return
                u=self.user(c)
                if not u: return self.respond(401,{'error':'Please sign in'})
                if path == ['logout'] and method=='POST':
                    c.execute('DELETE FROM sessions WHERE user_id=?',(u['id'],)); return self.respond(200,{'ok':True})
                if path == ['bootstrap'] and method=='GET':
                    campaigns=c.execute('SELECT * FROM campaigns' if u['role']=='admin' else 'SELECT campaigns.* FROM campaigns JOIN access ON campaigns.id=access.campaign_id WHERE user_id=?',() if u['role']=='admin' else (u['id'],)).fetchall()
                    return self.respond(200,{'user':{k:u[k] for k in ('name','email','role')},'campaigns':[dict(x) for x in campaigns],'seats':SEATS,'counties':COUNTIES})
                if path == ['campaigns'] and method=='POST':
                    if u['role']!='admin': return self.respond(403,{'error':'Administrator required'})
                    seat=data.get('seat'); county=data.get('county',''); constituency=data.get('constituency','').strip(); ward=data.get('ward','').strip()
                    if seat not in SEATS: raise ValueError('Choose a valid elective seat')
                    if seat!='President' and county not in COUNTIES: raise ValueError('Choose a county')
                    if seat in ('MP','MCA') and not constituency: raise ValueError('Constituency required')
                    if seat=='MCA' and not ward: raise ValueError('Ward required')
                    if not data.get('name','').strip(): raise ValueError('Aspirant name required')
                    budget=float(data.get('budget',0));
                    if budget<0: raise ValueError('Budget cannot be negative')
                    cid=secrets.token_hex(8)
                    c.execute('INSERT INTO campaigns VALUES(?,?,?,?,?,?,?,?,?)',(cid,data['name'].strip(),seat,county if seat!='President' else '',constituency if seat in ('MP','MCA') else '',ward if seat=='MCA' else '',str(data.get('party','Independent')),str(data.get('running_mate','')) if seat in ('President','Governor') else '',budget))
                    c.execute('INSERT INTO audit(actor,action,campaign_id) VALUES(?,?,?)',(u['email'],'Created campaign',cid)); return self.respond(201,{'id':cid})
                if len(path)>=2 and path[0]=='campaigns':
                    cid=path[1]
                    if not c.execute('SELECT 1 FROM campaigns WHERE id=?',(cid,)).fetchone(): return self.respond(404,{'error':'Campaign not found'})
                    if u['role']!='admin' and not c.execute('SELECT 1 FROM access WHERE user_id=? AND campaign_id=?',(u['id'],cid)).fetchone(): return self.respond(403,{'error':'Campaign access denied'})
                    if len(path)==3 and path[2]=='audit' and method=='GET':
                        if u['role'] not in ('admin','manager'): return self.respond(403,{'error':'Manager access required'})
                        return self.respond(200,[dict(x) for x in c.execute('SELECT * FROM audit WHERE campaign_id=? ORDER BY id DESC LIMIT 200',(cid,))])
                    if len(path)>=3 and path[2] in KINDS:
                        kind=path[2]
                        if method=='GET': return self.respond(200,[dict(id=x['id'],created=x['created'],**json.loads(x['data'])) for x in c.execute('SELECT * FROM records WHERE campaign_id=? AND kind=? ORDER BY created DESC,rowid DESC',(cid,kind))])
                        if u['role']=='viewer' or (kind in ('finance','messages') and u['role'] not in ('admin','manager')): return self.respond(403,{'error':'Insufficient permission'})
                        if method in ('POST','PATCH'):
                            if not str(data.get('title','')).strip(): raise ValueError('Title is required')
                            if kind=='finance':
                                data['amount']=float(data.get('amount',0))
                                if data['amount']<=0: raise ValueError('Amount must be positive')
                                if data.get('type') not in ('Income','Expense'): raise ValueError('Choose Income or Expense')
                            if kind=='messages': data['status']='Draft' # Never simulate provider delivery.
                            if kind=='volunteers' and data.get('phone'):
                                phone=''.join(ch for ch in str(data['phone']) if ch.isdigit())
                                if phone.startswith('0'): phone='254'+phone[1:]
                                if len(phone)!=12 or not phone.startswith(('2547','2541')): raise ValueError('Enter a Kenyan mobile number')
                                data['phone']=phone
                            if method=='POST':
                                rid=secrets.token_hex(8); c.execute('INSERT INTO records(id,campaign_id,kind,data) VALUES(?,?,?,?)',(rid,cid,kind,json.dumps(data)))
                            else:
                                if len(path)!=4: raise ValueError('Record ID required')
                                rid=path[3]; updated=c.execute('UPDATE records SET data=? WHERE id=? AND campaign_id=? AND kind=?',(json.dumps(data),rid,cid,kind)).rowcount
                                if not updated: return self.respond(404,{'error':'Record not found'})
                        elif method=='DELETE' and len(path)==4:
                            rid=path[3]
                            if not c.execute('DELETE FROM records WHERE id=? AND campaign_id=? AND kind=?',(rid,cid,kind)).rowcount: return self.respond(404,{'error':'Record not found'})
                        else: return self.respond(405,{'error':'Method not allowed'})
                        c.execute('INSERT INTO audit(actor,action,campaign_id) VALUES(?,?,?)',(u['email'],f'{method} {kind}',cid)); return self.respond(200,{'ok':True})
                return self.respond(404,{'error':'Not found'})
        except (ValueError,TypeError) as e: self.respond(400,{'error':str(e)})
        except Exception:
            self.log_error('Request failed'); self.respond(500,{'error':'Server error; check server logs'})

if __name__=='__main__':
    initialize(); ThreadingHTTPServer(('0.0.0.0',int(os.getenv('PORT','8000'))),Handler).serve_forever()
