"""Implementasi acuan independen (Python) untuk memeriksa dt-core.js.
Membuat pohon acak + tabel payoff acak, lalu menyimpan hasil rollback, CE, profil risiko,
kriteria keputusan, revisi Bayes, dan EVSI ke tests/fixtures-python.json.
Jalankan: python3 tests/ref_python.py tests/fixtures-python.json
"""
import json
import math
import random
import sys

random.seed(20261018)
seq = [0]


def nid(p):
    seq[0] += 1
    return f'{p}{seq[0]}'


def rand_tree(depth=0):
    if depth >= 3 or (depth > 0 and random.random() < 0.3):
        return {'id': nid('n'), 'type': 'terminal', 'name': '', 'payoff': round(random.uniform(-80, 150), 2), 'branches': []}
    typ = 'decision' if depth == 0 or random.random() < 0.4 else 'chance'
    k = random.randint(2, 3)
    ps = [random.random() + 0.05 for _ in range(k)]
    s = sum(ps)
    ps = [round(p / s, 4) for p in ps]
    ps[-1] = round(1 - sum(ps[:-1]), 10)
    branches = []
    for i in range(k):
        branches.append({'id': nid('b'), 'name': f'c{i}', 'prob': ps[i] if typ == 'chance' else '',
                         'value': round(random.uniform(-20, 10), 2) if random.random() < 0.4 else 0,
                         'child': rand_tree(depth + 1)})
    return {'id': nid('n'), 'type': typ, 'name': f'{typ}{depth}', 'branches': branches}


def U(x, mode, R):
    if mode == 'averse':
        return 1 - math.exp(-x / R)
    if mode == 'seeking':
        return math.exp(x / R) - 1
    return x


def Uinv(u, mode, R):
    if mode == 'averse':
        return -R * math.log(1 - u)
    if mode == 'seeking':
        return R * math.log(1 + u)
    return u


def rollback(n, cum, maximize=True, mode='neutral', R=100.0):
    """mengembalikan (ev, eu, choice-dict)"""
    if n['type'] == 'terminal':
        x = cum + n['payoff']
        return x, U(x, mode, R), {}
    kids = [rollback(b['child'], cum + float(b['value'] or 0), maximize, mode, R) for b in n['branches']]
    choices = {}
    for k in kids:
        choices.update(k[2])
    if n['type'] == 'chance':
        ev = sum(b['prob'] * k[0] for b, k in zip(n['branches'], kids))
        eu = sum(b['prob'] * k[1] for b, k in zip(n['branches'], kids))
        return ev, eu, choices
    score = [k[1] if mode != 'neutral' else k[0] for k in kids]
    best = max(score) if maximize else min(score)
    i = next(j for j, s in enumerate(score) if abs(s - best) <= 1e-10 * max(1, abs(best)))
    choices[n['id']] = i
    return kids[i][0], kids[i][1], choices


def profile(n, cum, choices, prob=1.0, out=None):
    out = [] if out is None else out
    if n['type'] == 'terminal':
        out.append((cum + n['payoff'], prob))
        return out
    if n['type'] == 'chance':
        for b in n['branches']:
            profile(b['child'], cum + float(b['value'] or 0), choices, prob * b['prob'], out)
        return out
    b = n['branches'][choices[n['id']]]
    return profile(b['child'], cum + float(b['value'] or 0), choices, prob, out)


trees = []
for t in range(30):
    tr = rand_tree()
    rec = {'tree': tr}
    ev, eu, ch = rollback(tr, 0)
    rec['ev'] = ev
    rec['choices'] = ch
    pts = profile(tr, 0, ch)
    mean = sum(x * p for x, p in pts)
    rec['profile_mean'] = mean
    rec['profile_sd'] = math.sqrt(sum(p * (x - mean) ** 2 for x, p in pts))
    for mode, R in [('averse', 60.0), ('seeking', 90.0)]:
        ev2, eu2, ch2 = rollback(tr, 0, True, mode, R)
        rec[mode] = {'R': R, 'ce': Uinv(eu2, mode, R), 'ev': ev2, 'choices': ch2}
    evm, _, chm = rollback(tr, 0, False)
    rec['min'] = {'ev': evm, 'choices': chm}
    trees.append(rec)

tables = []
for t in range(20):
    m = random.randint(2, 5)
    n = random.randint(2, 4)
    M = [[round(random.uniform(-100, 200), 1) for _ in range(n)] for _ in range(m)]
    pr = [random.random() + 0.1 for _ in range(n)]
    s = sum(pr)
    pr = [p / s for p in pr]
    alpha = round(random.uniform(0, 1), 2)
    K = random.randint(2, 3)
    L = []
    for _ in range(n):
        row = [random.random() + 0.05 for _ in range(K)]
        rs = sum(row)
        L.append([x / rs for x in row])
    rec = {'M': M, 'prior': pr, 'alpha': alpha, 'L': L}
    for obj in ['max', 'min']:
        best = max if obj == 'max' else min
        worst = min if obj == 'max' else max
        colbest = [best(M[i][j] for i in range(m)) for j in range(n)]
        regret = [[(colbest[j] - M[i][j]) if obj == 'max' else (M[i][j] - colbest[j]) for j in range(n)] for i in range(m)]
        ev = [sum(M[i][j] * pr[j] for j in range(n)) for i in range(m)]
        bev = best(ev)
        evwpi = sum(colbest[j] * pr[j] for j in range(n))
        r = {
            'optimistic': [best(r) for r in M], 'pessimistic': [worst(r) for r in M],
            'hurwicz': [alpha * best(r) + (1 - alpha) * worst(r) for r in M],
            'laplace': [sum(r) / n for r in M], 'ev': ev, 'maxRegret': [max(r) for r in regret],
            'eol': [sum(regret[i][j] * pr[j] for j in range(n)) for i in range(m)],
            'evpi': (evwpi - bev) if obj == 'max' else (bev - evwpi)
        }
        # Bayes & EVSI
        joint = [[pr[s] * L[s][k] for k in range(K)] for s in range(n)]
        marg = [sum(joint[s][k] for s in range(n)) for k in range(K)]
        post = [[joint[s][k] / marg[k] for k in range(K)] for s in range(n)]
        evwsi = 0
        for k in range(K):
            evk = [sum(M[i][s] * post[s][k] for s in range(n)) for i in range(m)]
            evwsi += marg[k] * best(evk)
        r['marginal'] = marg
        r['posterior'] = post
        r['evsi'] = (evwsi - bev) if obj == 'max' else (bev - evwsi)
        rec[obj] = r
    tables.append(rec)

json.dump({'trees': trees, 'tables': tables}, open(sys.argv[1], 'w'))
print('ok', len(trees), len(tables))
