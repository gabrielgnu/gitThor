/* Lanes are calculated on the complete loaded history before filtering. */
(function (root) {
  function layout(commits) {
    let lanes = [];
    const colors = new Map(); let nextColor = 0;
    const colorFor = hash => { if (!colors.has(hash)) colors.set(hash, nextColor++ % 6); return colors.get(hash); };
    return commits.map(commit => {
      let lane = lanes.indexOf(commit.hash);
      if (lane < 0) { lane = lanes.length; lanes.push(commit.hash); }
      const before = [...lanes], color = colorFor(commit.hash);
      const after = [...lanes];
      after.splice(lane, 1);
      if (commit.parents.length) {
        const first = commit.parents[0];
        if (!after.includes(first)) { after.splice(lane, 0, first); if (!colors.has(first)) colors.set(first, color); }
        for (const parent of commit.parents.slice(1)) if (!after.includes(parent)) after.push(parent);
      }
      const edges = [];
      before.forEach((hash, i) => {
        if (i !== lane && after.includes(hash)) edges.push({ from: i, to: after.indexOf(hash), color: colorFor(hash), start: 'top' });
      });
      for (const parent of commit.parents) edges.push({ from: lane, to: after.indexOf(parent), color: colorFor(parent), start: 'node' });
      lanes = after;
      return { hash: commit.hash, lane, color, width: Math.max(before.length, after.length, 1), edges };
    });
  }
  if (typeof module !== 'undefined') module.exports = { layout };
  else root.GitGraph = { layout };
})(typeof window !== 'undefined' ? window : globalThis);
