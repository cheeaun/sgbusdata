// Combine multiple LineStrings into a single valid trail by reusing only
// source segments. When the trail reaches a dead end, it reconnects by
// retracing existing graph segments instead of inventing straight lines.

const coordToKeyExact = (coord) => `${coord[0]},${coord[1]}`;

const coordToKeyRounded = (coord, decimals = 7) => {
  const x = Number(coord[0]).toFixed(decimals);
  const y = Number(coord[1]).toFixed(decimals);
  return `${x},${y}`;
};

const areLineStringsEqual = (ls1, ls2) => {
  if (ls1.length !== ls2.length) return false;
  for (let i = 0; i < ls1.length; i++) {
    if (coordToKeyExact(ls1[i]) !== coordToKeyExact(ls2[i])) return false;
  }
  return true;
};

const isLineStringReversed = (ls1, ls2) => {
  if (ls1.length !== ls2.length) return false;
  for (let i = 0; i < ls1.length; i++) {
    if (coordToKeyExact(ls1[i]) !== coordToKeyExact(ls2[ls2.length - 1 - i])) return false;
  }
  return true;
};

const areLineStringsEqualRounded = (ls1, ls2, decimals = 7) => {
  if (ls1.length !== ls2.length) return false;
  for (let i = 0; i < ls1.length; i++) {
    if (coordToKeyRounded(ls1[i], decimals) !== coordToKeyRounded(ls2[i], decimals)) return false;
  }
  return true;
};

const areLineStringsEqualAny = (ls1, ls2, decimals = 7) => {
  return (
    areLineStringsEqual(ls1, ls2) ||
    isLineStringReversed(ls1, ls2) ||
    areLineStringsEqualRounded(ls1, ls2, decimals) ||
    (() => {
      if (ls1.length !== ls2.length) return false;
      for (let i = 0; i < ls1.length; i++) {
        if (
          coordToKeyRounded(ls1[i], decimals) !==
          coordToKeyRounded(ls2[ls2.length - 1 - i], decimals)
        ) {
          return false;
        }
      }
      return true;
    })()
  );
};

const dedupeLineStrings = (lineStrings, decimals = 7) => {
  const unique = [];
  for (const coords of lineStrings) {
    const isDuplicate = unique.some((ls) => areLineStringsEqualAny(coords, ls, decimals));
    if (!isDuplicate) unique.push(coords);
  }
  return unique;
};

const dedupeConsecutiveCoordinates = (coords, decimals = 7) => {
  const unique = [];
  for (const coord of coords) {
    if (
      unique.length === 0 ||
      coordToKeyRounded(unique[unique.length - 1], decimals) !== coordToKeyRounded(coord, decimals)
    ) {
      unique.push(coord);
    }
  }
  return unique;
};

const distance = (coord1, coord2) => {
  const R = 6371e3;
  const phi1 = coord1[1] * Math.PI / 180;
  const phi2 = coord2[1] * Math.PI / 180;
  const deltaPhi = (coord2[1] - coord1[1]) * Math.PI / 180;
  const deltaLambda = (coord2[0] - coord1[0]) * Math.PI / 180;
  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const stitchIntoSingleLine = (lineStrings, decimals = 7, maxComponentGapMeters = 75) => {
  const nodeIdsByKey = new Map();

  const getNodeId = (coord) => {
    const key = coordToKeyRounded(coord, decimals);
    if (!nodeIdsByKey.has(key)) {
      nodeIdsByKey.set(key, nodeIdsByKey.size);
    }
    return nodeIdsByKey.get(key);
  };

  const uniqueSegments = [];
  const seenSegments = new Set();

  for (const coords of lineStrings) {
    for (let i = 1; i < coords.length; i++) {
      const startCoord = coords[i - 1];
      const endCoord = coords[i];
      const startKey = coordToKeyRounded(startCoord, decimals);
      const endKey = coordToKeyRounded(endCoord, decimals);
      if (startKey === endKey) continue;

      const canonicalKey =
        startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
      if (seenSegments.has(canonicalKey)) continue;
      seenSegments.add(canonicalKey);

      uniqueSegments.push({
        edgeId: uniqueSegments.length,
        s: getNodeId(startCoord),
        e: getNodeId(endCoord),
        startCoord,
        endCoord,
      });
    }
  }

  if (uniqueSegments.length === 0) {
    return {
      coords: dedupeConsecutiveCoordinates(lineStrings[0] || [], decimals),
      edgesUsed: 0,
      edgesTotal: 0,
      componentsUsed: 0,
      componentsTotal: 0,
    };
  }

  const adj = Array.from({ length: nodeIdsByKey.size }, () => []);
  uniqueSegments.forEach((edge) => {
    adj[edge.s].push(edge.edgeId);
    adj[edge.e].push(edge.edgeId);
  });

  const seenNodes = new Set();
  const components = [];
  for (let nodeId = 0; nodeId < adj.length; nodeId++) {
    if (seenNodes.has(nodeId) || adj[nodeId].length === 0) continue;
    const stack = [nodeId];
    const componentNodes = [];
    const componentEdges = new Set();
    seenNodes.add(nodeId);

    while (stack.length) {
      const current = stack.pop();
      componentNodes.push(current);
      for (const edgeId of adj[current]) {
        componentEdges.add(edgeId);
        const edge = uniqueSegments[edgeId];
        const nextNodeId = edge.s === current ? edge.e : edge.s;
        if (!seenNodes.has(nextNodeId)) {
          seenNodes.add(nextNodeId);
          stack.push(nextNodeId);
        }
      }
    }

    components.push({
      nodes: componentNodes,
      edges: [...componentEdges],
    });
  }

  const buildTrailForComponent = ({ nodes, edges }) => {
    const edgeSet = new Set(edges);
    const degreeInComponent = (nodeId) => adj[nodeId].filter((edgeId) => edgeSet.has(edgeId)).length;
    const oddNodes = nodes
      .filter((nodeId) => degreeInComponent(nodeId) % 2 === 1)
      .sort((a, b) => degreeInComponent(b) - degreeInComponent(a));
    const startNodes =
      oddNodes.length > 0
        ? oddNodes
        : nodes.slice().sort((a, b) => degreeInComponent(b) - degreeInComponent(a));

    const edgeIdsByDirection = new Map();
    for (const edgeId of edges) {
      const edge = uniqueSegments[edgeId];
      edgeIdsByDirection.set(`${edge.s}|${edge.e}`, edgeId);
      edgeIdsByDirection.set(`${edge.e}|${edge.s}`, edgeId);
    }

    const buildTrailFromStart = (startNode) => {
      const used = new Set();
      const trailNodes = [startNode];
      let currentNode = startNode;
      const localAdj = new Map(
        nodes.map((nodeId) => [
          nodeId,
          adj[nodeId].filter((edgeId) => edgeSet.has(edgeId)).slice(),
        ]),
      );

      const nodesWithUnusedEdges = () =>
        nodes.filter((nodeId) => localAdj.get(nodeId).some((edgeId) => !used.has(edgeId)));

      const shortestPathToUnusedNode = (fromNodeId) => {
        const targets = new Set(
          nodes.filter(
            (nodeId) =>
              nodeId !== fromNodeId && localAdj.get(nodeId).some((edgeId) => !used.has(edgeId)),
          ),
        );
        if (targets.size === 0) return null;

        const prev = new Map();
        const seen = new Set([fromNodeId]);
        const queue = [fromNodeId];

        while (queue.length) {
          const nodeId = queue.shift();
          if (targets.has(nodeId)) {
            const path = [nodeId];
            let cursor = nodeId;
            while (prev.has(cursor)) {
              cursor = prev.get(cursor);
              path.push(cursor);
            }
            return path.reverse();
          }

          for (const edgeId of localAdj.get(nodeId)) {
            const edge = uniqueSegments[edgeId];
            const otherNodeId = edge.s === nodeId ? edge.e : edge.s;
            if (seen.has(otherNodeId)) continue;
            seen.add(otherNodeId);
            prev.set(otherNodeId, nodeId);
            queue.push(otherNodeId);
          }
        }

        return null;
      };

      while (true) {
        const candidates = localAdj.get(currentNode).filter((edgeId) => !used.has(edgeId));
        if (candidates.length === 0) {
          const reconnectPath = shortestPathToUnusedNode(currentNode);
          if (!reconnectPath || reconnectPath.length < 2) break;
          trailNodes.push(...reconnectPath.slice(1));
          currentNode = reconnectPath[reconnectPath.length - 1];
          continue;
        }

        let chosenEdgeId = candidates[0];
        if (candidates.length > 1) {
          const preserveNodes = new Set(nodesWithUnusedEdges());
          const nonBridgeCandidates = candidates.filter((candidateEdgeId) => {
            const candidateEdge = uniqueSegments[candidateEdgeId];
            const nextNodeId = candidateEdge.s === currentNode ? candidateEdge.e : candidateEdge.s;
            const seen = new Set([nextNodeId]);
            const stack = [nextNodeId];

            while (stack.length) {
              const nodeId = stack.pop();
              for (const edgeId of localAdj.get(nodeId)) {
                if (edgeId === candidateEdgeId || used.has(edgeId)) continue;
                const edge = uniqueSegments[edgeId];
                const otherNodeId = edge.s === nodeId ? edge.e : edge.s;
                if (!seen.has(otherNodeId)) {
                  seen.add(otherNodeId);
                  stack.push(otherNodeId);
                }
              }
            }

            for (const nodeId of preserveNodes) {
              if (nodeId === currentNode) continue;
              if (!seen.has(nodeId)) return false;
            }
            return true;
          });

          if (nonBridgeCandidates.length > 0) {
            chosenEdgeId = nonBridgeCandidates[0];
          }
        }

        used.add(chosenEdgeId);
        const edge = uniqueSegments[chosenEdgeId];
        currentNode = edge.s === currentNode ? edge.e : edge.s;
        trailNodes.push(currentNode);
      }

      const coords = [];
      for (let i = 1; i < trailNodes.length; i++) {
        const fromNodeId = trailNodes[i - 1];
        const toNodeId = trailNodes[i];
        const edgeId = edgeIdsByDirection.get(`${fromNodeId}|${toNodeId}`);
        if (edgeId == null) continue;
        const edge = uniqueSegments[edgeId];
        const orientedCoords =
          edge.s === fromNodeId ? [edge.startCoord, edge.endCoord] : [edge.endCoord, edge.startCoord];

        if (coords.length === 0) {
          coords.push(...orientedCoords);
        } else {
          const lastCoord = coords[coords.length - 1];
          const lastKey = coordToKeyRounded(lastCoord, decimals);
          const firstKey = coordToKeyRounded(orientedCoords[0], decimals);
          coords.push(...(lastKey === firstKey ? orientedCoords.slice(1) : orientedCoords));
        }
      }

      return {
        coords: dedupeConsecutiveCoordinates(coords, decimals),
        edgesUsed: used.size,
      };
    };

    let bestTrail = null;
    for (const startNode of startNodes) {
      const trail = buildTrailFromStart(startNode);
      if (
        !bestTrail ||
        trail.edgesUsed > bestTrail.edgesUsed ||
        (trail.edgesUsed === bestTrail.edgesUsed && trail.coords.length > bestTrail.coords.length)
      ) {
        bestTrail = trail;
      }
    }

    return bestTrail || {
      coords: [],
      edgesUsed: 0,
    };
  };

  const componentTrails = components
    .map((component) => buildTrailForComponent(component))
    .filter((result) => result.coords.length > 0)
    .sort((a, b) => b.edgesUsed - a.edgesUsed || b.coords.length - a.coords.length);

  if (componentTrails.length === 0) {
    return { coords: [], edgesUsed: 0, edgesTotal: uniqueSegments.length, componentsUsed: 0, componentsTotal: 0 };
  }

  let stitchedCoords = componentTrails[0].coords.slice();
  let edgesUsed = componentTrails[0].edgesUsed;
  let componentsUsed = 1;

  for (const component of componentTrails.slice(1)) {
    const trailEnd = stitchedCoords[stitchedCoords.length - 1];
    const directDistance = distance(trailEnd, component.coords[0]);
    const reverseDistance = distance(trailEnd, component.coords[component.coords.length - 1]);
    const minGap = Math.min(directDistance, reverseDistance);
    if (minGap > maxComponentGapMeters) continue;

    const orientedCoords =
      reverseDistance < directDistance ? component.coords.slice().reverse() : component.coords;
    stitchedCoords.push(...orientedCoords);
    edgesUsed += component.edgesUsed;
    componentsUsed += 1;
  }

  return {
    coords: dedupeConsecutiveCoordinates(stitchedCoords, decimals),
    edgesUsed,
    edgesTotal: uniqueSegments.length,
    componentsUsed,
    componentsTotal: componentTrails.length,
  };
};

function combineLineStrings(rawLineStrings, options = {}) {
  if (!Array.isArray(rawLineStrings) || rawLineStrings.length === 0) return null;

  const decimalsCandidates = options.decimalsCandidates || [7, 6, 5];
  const componentGapCandidates = options.componentGapCandidates || [25, 50, 75, 100];
  let best = null;

  for (const decimals of decimalsCandidates) {
    for (const maxComponentGapMeters of componentGapCandidates) {
      const uniqueLineStrings = dedupeLineStrings(rawLineStrings, decimals);
      const stitched = stitchIntoSingleLine(uniqueLineStrings, decimals, maxComponentGapMeters);
      const coords = stitched?.coords || [];
      if (coords.length === 0) continue;

      const score = {
        coordinates: coords,
        coordsLen: coords.length,
        edgesUsed: stitched.edgesUsed,
        edgesTotal: stitched.edgesTotal,
        componentsUsed: stitched.componentsUsed,
        componentsTotal: stitched.componentsTotal,
        uniqueCount: uniqueLineStrings.length,
        stitchDecimals: decimals,
        stitchMaxComponentGapMeters: maxComponentGapMeters,
      };

      if (
        !best ||
        score.edgesUsed > best.edgesUsed ||
        (score.edgesUsed === best.edgesUsed && score.componentsUsed > best.componentsUsed) ||
        (score.edgesUsed === best.edgesUsed &&
          score.componentsUsed === best.componentsUsed &&
          score.coordsLen > best.coordsLen)
      ) {
        best = score;
      }
    }
  }

  return best;
}

module.exports = combineLineStrings;
