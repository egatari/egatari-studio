scores = [3, 1, 4, 2]
n = len(scores)
for i in range(n - 1):
    for j in range(n - 1 - i):
        if scores[j] > scores[j + 1]:
            scores[j], scores[j + 1] = scores[j + 1], scores[j]
print(scores)
