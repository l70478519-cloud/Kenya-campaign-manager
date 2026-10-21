"""Offline administrator tool: create users and grant campaign access."""
import argparse, getpass, secrets
from server import initialize, connect, password_hash
p=argparse.ArgumentParser(); p.add_argument('email'); p.add_argument('--name',required=True); p.add_argument('--role',choices=['admin','manager','officer','viewer'],required=True); p.add_argument('--campaign',action='append',default=[]); args=p.parse_args()
initialize()
pw=getpass.getpass('New password (12+ characters): ')
if len(pw)<12: p.error('Password must be at least 12 characters')
with connect() as c:
    for cid in args.campaign:
        if not c.execute('SELECT 1 FROM campaigns WHERE id=?',(cid,)).fetchone(): p.error('Unknown campaign '+cid)
    salt=secrets.token_hex(16); uid=secrets.token_hex(8)
    c.execute('INSERT INTO users VALUES(?,?,?,?,?,?)',(uid,args.email.lower(),args.name,args.role,salt,password_hash(pw,salt)))
    for cid in args.campaign: c.execute('INSERT INTO access VALUES(?,?)',(uid,cid))
print('User created. Only explicitly granted campaigns are accessible to non-admin users.')
