votes = ["劇", "展示", "劇"]
counts = {}
for v in votes:
    counts[v] = counts.get(v, 0) + 1
print(counts)
