"""Quick smoke test — hits every route and reports HTTP status codes.

Run:  python smoke_test.py
Any route returning 500 (or an unexpected 4xx) needs attention.
"""
from app import app


def check(label, resp, expect=(200, 302, 301)):
    ok = resp.status_code in expect
    print(f"{'✅' if ok else '❌'} {resp.status_code}  {label}")
    return ok


all_ok = True

with app.test_client() as c:
    # ---- Public pages ----
    all_ok &= check("GET /", c.get("/"))
    all_ok &= check("GET /catalog", c.get("/catalog"))
    all_ok &= check("GET /catalog/toyota-harrier-2017", c.get("/catalog/toyota-harrier-2017"))
    all_ok &= check("GET /how-it-works", c.get("/how-it-works"))
    all_ok &= check("GET /pricing", c.get("/pricing"))
    all_ok &= check("GET /about", c.get("/about"))
    all_ok &= check("GET /contact", c.get("/contact"))
    all_ok &= check("GET /track", c.get("/track"))
    all_ok &= check("GET /track?order=TA-2026-0001", c.get("/track?order=TA-2026-0001"))
    all_ok &= check("GET /app", c.get("/app"))
    all_ok &= check("GET /brands", c.get("/brands"))
    all_ok &= check("GET /compare", c.get("/compare"))

    # ---- Public API ----
    all_ok &= check("GET /api/vehicles", c.get("/api/vehicles"))
    all_ok &= check("GET /api/vehicles?q=harrier", c.get("/api/vehicles?q=harrier"))
    all_ok &= check("GET /api/config", c.get("/api/config"))
    all_ok &= check("GET /api/me", c.get("/api/me"))
    all_ok &= check("GET /api/orders/public/TA-2026-0001", c.get("/api/orders/public/TA-2026-0001"))
    all_ok &= check("POST /api/chat", c.post("/api/chat", json={"message": "How does it work?"}))
    all_ok &= check("POST /api/chat (track)", c.post("/api/chat", json={"message": "track TA-2026-0001"}))
    all_ok &= check("GET /api/vehicles (advanced filters)", c.get("/api/vehicles?price_min=3000&price_max=8000&year_min=2016&fuel=Petrol"))
    all_ok &= check("GET /api/vehicles (pagination)", c.get("/api/vehicles?page=1&per_page=5"))
    all_ok &= check("GET /api/vehicles/compare?ids=1,2,3", c.get("/api/vehicles/compare?ids=1,2,3"))
    all_ok &= check("POST /api/inquiries", c.post("/api/inquiries", json={
        "vehicle_id": 1, "name": "Smoke Tester", "phone": "+263 77 000 0000",
        "message": "Smoke test enquiry"}))
    all_ok &= check("POST /api/requests", c.post("/api/requests", json={
        "name": "Smoke Requester", "phone": "+263 77 111 2222",
        "make": "Toyota", "model": "Vitz", "budget_max_usd": 4000}))
    all_ok &= check("GET /api/reviews", c.get("/api/reviews"))
    all_ok &= check("GET /request-a-car", c.get("/request-a-car"))
    all_ok &= check("GET /grades", c.get("/grades"))

    # ---- Customer flow ----
    r = c.post("/api/auth/login", json={"email": "demo@trueautozim.co.zw", "password": "Demo123!"})
    all_ok &= check("POST /api/auth/login", r)
    all_ok &= check("GET /dashboard", c.get("/dashboard"))
    all_ok &= check("GET /dashboard/orders/1", c.get("/dashboard/orders/1"))
    all_ok &= check("GET /invoice/1", c.get("/invoice/1"))
    all_ok &= check("GET /api/orders", c.get("/api/orders"))
    all_ok &= check("GET /api/orders/1", c.get("/api/orders/1"))
    r = c.post("/api/orders/1/payments", json={"method": "ecocash", "amount": 100, "reference": "TEST-REF-123"})
    all_ok &= check("POST /api/orders/1/payments", r)
    all_ok &= check("GET /checkout/toyota-harrier-2017", c.get("/checkout/toyota-harrier-2017"))
    all_ok &= check("GET /api/notifications", c.get("/api/notifications"))
    all_ok &= check("GET /api/notifications/unread-count", c.get("/api/notifications/unread-count"))
    all_ok &= check("POST /api/notifications/read-all", c.post("/api/notifications/read-all"))
    all_ok &= check("GET /api/wishlist", c.get("/api/wishlist"))
    all_ok &= check("GET /api/wishlist/ids", c.get("/api/wishlist/ids"))
    r = c.post("/api/wishlist", json={"vehicle_id": 3})
    all_ok &= check("POST /api/wishlist", r)
    all_ok &= check("DELETE /api/wishlist/3", c.delete("/api/wishlist/3"))
    c.get("/logout")

    # ---- Admin flow ----
    r = c.post("/api/auth/login", json={"email": "admin@trueautozim.co.zw", "password": "Admin123!"})
    all_ok &= check("POST /api/auth/login (admin)", r)
    all_ok &= check("GET /admin", c.get("/admin"))
    all_ok &= check("GET /admin/orders", c.get("/admin/orders"))
    all_ok &= check("GET /admin/orders/1", c.get("/admin/orders/1"))
    all_ok &= check("GET /admin/vehicles", c.get("/admin/vehicles"))
    all_ok &= check("GET /admin/vehicles/new", c.get("/admin/vehicles/new"))
    all_ok &= check("GET /api/admin/stats", c.get("/api/admin/stats"))
    all_ok &= check("GET /api/admin/orders", c.get("/api/admin/orders"))
    all_ok &= check("GET /api/admin/orders/1", c.get("/api/admin/orders/1"))
    all_ok &= check("GET /api/admin/vehicles", c.get("/api/admin/vehicles"))
    all_ok &= check("GET /api/admin/inquiries", c.get("/api/admin/inquiries"))
    inq = c.get("/api/admin/inquiries").get_json()["inquiries"]
    if inq:
        all_ok &= check("POST /api/admin/inquiries status", c.post(
            f"/api/admin/inquiries/{inq[0]['id']}/status", json={"status": "replied"}))
    all_ok &= check("GET /api/admin/requests", c.get("/api/admin/requests"))
    reqs = c.get("/api/admin/requests").get_json()["requests"]
    if reqs:
        all_ok &= check("POST /api/admin/requests status", c.post(
            f"/api/admin/requests/{reqs[0]['id']}/status", json={"status": "sourcing"}))
    all_ok &= check("GET /api/admin/reviews", c.get("/api/admin/reviews"))
    r = c.post("/api/admin/orders/1/advance", json={"stage": "port", "note": "smoke test"})
    all_ok &= check("POST /api/admin/orders/1/advance", r)

    # Admin advance must create an in-app notification for the customer
    c.get("/logout")
    c.post("/api/auth/login", json={"email": "demo@trueautozim.co.zw", "password": "Demo123!"})
    notifs = c.get("/api/notifications").get_json()["notifications"]
    has_notif = any("Arrived at Port" in n["title"] for n in notifs)
    print(f"{'✅' if has_notif else '❌'}  notification created on stage advance")
    all_ok &= has_notif

print("\n" + ("🎉 ALL ROUTES OK" if all_ok else "⚠️ SOME ROUTES FAILED — check above"))
