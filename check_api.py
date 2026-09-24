import urllib.request, urllib.error
try:
    urllib.request.urlopen('http://localhost:8000/api/reports/elliot')
except urllib.error.HTTPError as e:
    print(e.read().decode())
