import json,urllib.request,sys,time
from concurrent.futures import ThreadPoolExecutor
R='https://eth.drpc.org'
A='85d456b2dff1fd8245387c0bfb64dfb700e98ef3'
blk=sys.argv[1]
def one(e):
    for t in range(5):
        try:
            req=urllib.request.Request(R,data=json.dumps({"jsonrpc":"2.0","id":e,"method":"eth_call","params":[{"to":"0x"+A,"data":"0xbb0b6a53"+hex(e)[2:].rjust(64,'0')},blk]}).encode(),headers={'content-type':'application/json','user-agent':'curl/8'})
            r=json.load(urllib.request.urlopen(req,timeout=30))
            if 'result' in r: return e,r['result']
        except Exception as ex: pass
        time.sleep(1+t)
    return e,None
with ThreadPoolExecutor(6) as ex:
    res=list(ex.map(one,range(int(sys.argv[2]),int(sys.argv[3]))))
print(json.dumps({e:r[-40:] for e,r in res if r and int(r,16)!=0}))
print('failed',[e for e,r in res if r is None],file=sys.stderr)
