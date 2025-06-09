import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Zap, GitBranch, Mountain, Hammer, Shield, Clock } from 'lucide-react';

const ProjectInnovationPrototypes = () => {
  // Homotopic Project State
  const [homotopyTime, setHomotopyTime] = useState(0);
  const [isHomotopyPlaying, setIsHomotopyPlaying] = useState(false);
  const [selectedPath, setSelectedPath] = useState(0);
  const [showPathDetails, setShowPathDetails] = useState(true);
  
  // Morphogenetic Field State
  const [fieldStrength, setFieldStrength] = useState(0.5);
  const [isFieldAnimating, setIsFieldAnimating] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [selectedTaskInfo, setSelectedTaskInfo] = useState(null);
  const morphoCanvasRef = useRef(null);
  const homotopyCanvasRef = useRef(null);

  // Project paths for building the cliff shed
  const projectPaths = [
    {
      name: "Helicopter Assembly",
      color: "#ef4444",
      description: "Pre-fab modules airlifted",
      milestones: [
        { name: "Ground Assembly", x: 100, y: 350 },
        { name: "Weather Window", x: 150, y: 250 },
        { name: "Airlift", x: 250, y: 200 },
        { name: "Cliff Assembly", x: 350, y: 50 }
      ]
    },
    {
      name: "Rope & Pulley System",
      color: "#3b82f6",
      description: "Materials hauled up incrementally",
      milestones: [
        { name: "Base Camp", x: 100, y: 350 },
        { name: "Pulley Install", x: 200, y: 300 },
        { name: "Material Haul", x: 300, y: 150 },
        { name: "Cliff Build", x: 350, y: 50 }
      ]
    },
    {
      name: "Climbing Construction",
      color: "#10b981",
      description: "Climbers build in-situ",
      milestones: [
        { name: "Team Staging", x: 100, y: 350 },
        { name: "Route Setup", x: 120, y: 200 },
        { name: "Platform Build", x: 250, y: 100 },
        { name: "Shed Assembly", x: 350, y: 50 }
      ]
    }
  ];

  // Task types for morphogenetic field
  const taskTypes = {
    foundation: { color: '#8b5cf6', icon: '⚓', name: 'Foundation/Anchoring' },
    structure: { color: '#f59e0b', icon: '🏗️', name: 'Structural' },
    weatherproofing: { color: '#10b981', icon: '🛡️', name: 'Weatherproofing' },
    safety: { color: '#ef4444', icon: '🧗', name: 'Safety Systems' }
  };

  const shedTasks = [
    // Foundation tasks
    { name: "Drill anchor points", type: 'foundation', priority: 'critical' },
    { name: "Install expansion bolts", type: 'foundation', priority: 'critical' },
    { name: "Test anchor loads", type: 'foundation', priority: 'high' },
    { name: "Level platform base", type: 'foundation', priority: 'high' },
    
    // Structural tasks
    { name: "Assemble floor frame", type: 'structure', priority: 'high' },
    { name: "Install wall panels", type: 'structure', priority: 'medium' },
    { name: "Mount roof trusses", type: 'structure', priority: 'medium' },
    { name: "Secure joints", type: 'structure', priority: 'high' },
    
    // Weatherproofing tasks
    { name: "Install roof membrane", type: 'weatherproofing', priority: 'critical' },
    { name: "Seal wall joints", type: 'weatherproofing', priority: 'high' },
    { name: "Add wind bracing", type: 'weatherproofing', priority: 'critical' },
    { name: "Install door seals", type: 'weatherproofing', priority: 'medium' },
    
    // Safety tasks
    { name: "Install safety railings", type: 'safety', priority: 'critical' },
    { name: "Add emergency anchors", type: 'safety', priority: 'critical' },
    { name: "Mount first aid station", type: 'safety', priority: 'high' },
    { name: "Test egress routes", type: 'safety', priority: 'high' }
  ];

  // Initialize tasks for morphogenetic field
  useEffect(() => {
    const initialTasks = shedTasks.map((task, i) => ({
      id: i,
      ...task,
      x: 200 + (Math.random() - 0.5) * 300,
      y: 200 + (Math.random() - 0.5) * 300,
      vx: 0,
      vy: 0,
      connections: [],
      phase: null
    }));
    setTasks(initialTasks);
  }, []);

  // Homotopy animation
  useEffect(() => {
    if (!isHomotopyPlaying || !homotopyCanvasRef.current) return;
    
    const interval = setInterval(() => {
      setHomotopyTime(t => {
        const newT = t + 0.015;
        if (newT >= 1) {
          setSelectedPath((selectedPath + 1) % 3);
          return 0;
        }
        return newT;
      });
    }, 50);
    
    return () => clearInterval(interval);
  }, [isHomotopyPlaying, selectedPath]);

  // Draw homotopy visualization
  useEffect(() => {
    const canvas = homotopyCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 400, 400);

    // Draw cliff background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 400, 400);
    
    // Draw cliff face
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(300, 400);
    ctx.lineTo(300, 0);
    ctx.lineTo(400, 0);
    ctx.lineTo(400, 400);
    ctx.fill();
    
    // Draw target location
    ctx.fillStyle = '#fbbf24';
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(350, 50, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    
    // Get current and next paths
    const fromPath = projectPaths[selectedPath];
    const toPath = projectPaths[(selectedPath + 1) % projectPaths.length];
    const t = homotopyTime;
    
    // Draw morphing path
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 4;
    ctx.beginPath();
    
    fromPath.milestones.forEach((milestone, i) => {
      const nextMilestone = fromPath.milestones[i + 1];
      if (!nextMilestone) return;
      
      const fromStart = milestone;
      const fromEnd = nextMilestone;
      const toStart = toPath.milestones[Math.min(i, toPath.milestones.length - 1)];
      const toEnd = toPath.milestones[Math.min(i + 1, toPath.milestones.length - 1)];
      
      const startX = fromStart.x + (toStart.x - fromStart.x) * t;
      const startY = fromStart.y + (toStart.y - fromStart.y) * t;
      const endX = fromEnd.x + (toEnd.x - fromEnd.x) * t;
      const endY = fromEnd.y + (toEnd.y - fromEnd.y) * t;
      
      if (i === 0) ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
    });
    ctx.stroke();
    
    // Draw milestone nodes
    const morphedMilestones = fromPath.milestones.map((milestone, i) => {
      const toMilestone = toPath.milestones[Math.min(i, toPath.milestones.length - 1)];
      return {
        name: t < 0.5 ? milestone.name : toMilestone.name,
        x: milestone.x + (toMilestone.x - milestone.x) * t,
        y: milestone.y + (toMilestone.y - milestone.y) * t
      };
    });
    
    morphedMilestones.forEach((milestone, i) => {
      ctx.fillStyle = i === 0 ? '#10b981' : i === morphedMilestones.length - 1 ? '#ef4444' : '#3b82f6';
      ctx.beginPath();
      ctx.arc(milestone.x, milestone.y, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Labels
      ctx.fillStyle = '#fff';
      ctx.font = '11px sans-serif';
      ctx.fillText(milestone.name, milestone.x + 10, milestone.y - 5);
    });
    
    // Draw invariants panel
    const invariants = [
      { name: 'Storm Protection', icon: '🛡️', preserved: true },
      { name: 'Cliff Safety', icon: '⚠️', preserved: true },
      { name: 'Winter Deadline', icon: '❄️', preserved: true },
      { name: '$50k Budget', icon: '💰', preserved: true }
    ];
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 150, 100);
    
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('Preserved Invariants:', 20, 30);
    
    ctx.font = '11px sans-serif';
    invariants.forEach((inv, i) => {
      ctx.fillStyle = '#fff';
      ctx.fillText(`${inv.icon} ${inv.name}`, 20, 50 + i * 18);
      ctx.fillStyle = '#10b981';
      ctx.fillText('✓', 140, 50 + i * 18);
    });
    
    // Current approach indicator
    const currentApproach = t < 0.5 ? fromPath : toPath;
    ctx.fillStyle = currentApproach.color;
    ctx.fillRect(10, 350, 5, 40);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(currentApproach.name, 20, 370);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(currentApproach.description, 20, 385);
  }, [homotopyTime, selectedPath]);

  // Morphogenetic field simulation with cliff-specific constraints
  useEffect(() => {
    if (!isFieldAnimating) return;
    
    const interval = setInterval(() => {
      setTasks(prevTasks => {
        const newTasks = [...prevTasks];
        
        // Calculate morphogenetic fields with project-specific rules
        newTasks.forEach((task, i) => {
          let fx = 0, fy = 0;
          
          newTasks.forEach((other, j) => {
            if (i === j) return;
            
            const dx = other.x - task.x;
            const dy = other.y - task.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 150) {
              // Task affinity rules for cliff construction
              let affinity = 0;
              
              // Same type tasks attract strongly
              if (task.type === other.type) {
                affinity = 1.2;
              }
              // Foundation must come before structure
              else if (task.type === 'foundation' && other.type === 'structure') {
                affinity = 0.8;
              }
              // Structure attracts weatherproofing
              else if (task.type === 'structure' && other.type === 'weatherproofing') {
                affinity = 0.6;
              }
              // Safety integrates with everything
              else if (task.type === 'safety' || other.type === 'safety') {
                affinity = 0.4;
              }
              else {
                affinity = -0.3; // Mild repulsion for unrelated tasks
              }
              
              // Priority-based field strength
              const priorityMultiplier = task.priority === 'critical' ? 1.5 : 1;
              
              const force = fieldStrength * affinity * priorityMultiplier * (1 - dist / 150);
              
              fx += force * dx / dist;
              fy += force * dy / dist;
              
              // Optimal distance maintenance
              const optimalDist = task.type === other.type ? 60 : 100;
              if (dist < optimalDist) {
                fx -= (optimalDist - dist) * dx / dist * 0.1;
                fy -= (optimalDist - dist) * dy / dist * 0.1;
              }
            }
          });
          
          // Apply forces with damping
          task.vx = task.vx * 0.88 + fx * 0.12;
          task.vy = task.vy * 0.88 + fy * 0.12;
          task.x += task.vx;
          task.y += task.vy;
          
          // Boundary constraints
          task.x = Math.max(20, Math.min(380, task.x));
          task.y = Math.max(20, Math.min(380, task.y));
        });
        
        // Update connections based on construction dependencies
        newTasks.forEach((task, i) => {
          task.connections = [];
          newTasks.forEach((other, j) => {
            if (i >= j) return;
            const dist = Math.sqrt(
              Math.pow(task.x - other.x, 2) + 
              Math.pow(task.y - other.y, 2)
            );
            
            // Connect based on construction logic
            let shouldConnect = false;
            if (dist < 100) {
              if (task.type === other.type) shouldConnect = true;
              else if (task.type === 'foundation' && other.type === 'structure') shouldConnect = true;
              else if (task.type === 'structure' && other.type === 'weatherproofing') shouldConnect = true;
              else if (task.type === 'safety') shouldConnect = true;
            }
            
            if (shouldConnect) {
              task.connections.push(j);
            }
          });
        });
        
        // Identify emergent phases
        const clusters = identifyClusters(newTasks);
        clusters.forEach((cluster, clusterIdx) => {
          cluster.forEach(taskIdx => {
            newTasks[taskIdx].phase = `Phase ${clusterIdx + 1}`;
          });
        });
        
        return newTasks;
      });
    }, 50);
    
    return () => clearInterval(interval);
  }, [isFieldAnimating, fieldStrength]);

  // Draw morphogenetic visualization
  useEffect(() => {
    const canvas = morphoCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 400, 400);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 400, 400);

    // Draw field gradient visualization
    if (isFieldAnimating) {
      for (let x = 0; x < 400; x += 20) {
        for (let y = 0; y < 400; y += 20) {
          let fieldIntensity = 0;
          tasks.forEach(task => {
            const dist = Math.sqrt(Math.pow(x - task.x, 2) + Math.pow(y - task.y, 2));
            const priority = task.priority === 'critical' ? 2 : 1;
            fieldIntensity += Math.exp(-dist / 50) * fieldStrength * priority;
          });
          
          // Color based on dominant nearby task type
          let dominantType = null;
          let maxInfluence = 0;
          Object.keys(taskTypes).forEach(type => {
            const influence = tasks
              .filter(t => t.type === type)
              .reduce((sum, t) => {
                const dist = Math.sqrt(Math.pow(x - t.x, 2) + Math.pow(y - t.y, 2));
                return sum + Math.exp(-dist / 30);
              }, 0);
            if (influence > maxInfluence) {
              maxInfluence = influence;
              dominantType = type;
            }
          });
          
          if (dominantType && maxInfluence > 0.1) {
            const color = taskTypes[dominantType].color;
            ctx.fillStyle = color + Math.floor(Math.min(maxInfluence * 80, 80)).toString(16).padStart(2, '0');
            ctx.fillRect(x - 10, y - 10, 20, 20);
          }
        }
      }
    }

    // Draw connections
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1;
    tasks.forEach((task, i) => {
      task.connections.forEach(j => {
        const other = tasks[j];
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(task.x, task.y);
        ctx.lineTo(other.x, other.y);
        ctx.stroke();
      });
    });

    // Draw tasks
    tasks.forEach((task, idx) => {
      const typeInfo = taskTypes[task.type];
      
      // Task node
      ctx.globalAlpha = 1;
      ctx.fillStyle = typeInfo.color;
      ctx.beginPath();
      ctx.arc(task.x, task.y, task.priority === 'critical' ? 10 : 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Priority indicator
      if (task.priority === 'critical') {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      // Task icon
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(typeInfo.icon, task.x, task.y + 4);
      
      // Hover info
      if (selectedTaskInfo === idx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(task.x + 15, task.y - 20, 150, 35);
        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(task.name, task.x + 20, task.y - 5);
        ctx.fillStyle = typeInfo.color;
        ctx.fillText(`${typeInfo.name} - ${task.priority}`, task.x + 20, task.y + 8);
      }
    });

    // Draw emergent phase clusters
    const clusters = identifyClusters(tasks);
    ctx.globalAlpha = 0.3;
    ctx.setLineDash([5, 5]);
    
    clusters.forEach((cluster, idx) => {
      if (cluster.length > 2) {
        // Determine dominant type in cluster
        const typeCounts = {};
        cluster.forEach(i => {
          typeCounts[tasks[i].type] = (typeCounts[tasks[i].type] || 0) + 1;
        });
        const dominantType = Object.entries(typeCounts)
          .sort((a, b) => b[1] - a[1])[0][0];
        
        ctx.strokeStyle = taskTypes[dominantType].color;
        ctx.lineWidth = 2;
        
        const hull = convexHull(cluster.map(i => ({ x: tasks[i].x, y: tasks[i].y })));
        ctx.beginPath();
        hull.forEach((point, idx) => {
          if (idx === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.closePath();
        ctx.stroke();
        
        // Phase label
        const center = hull.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
        center.x /= hull.length;
        center.y /= hull.length;
        
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = taskTypes[dominantType].color;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Phase ${idx + 1}`, center.x, center.y);
      }
    });
    ctx.setLineDash([]);
    ctx.textAlign = 'left';
  }, [tasks, isFieldAnimating, fieldStrength, selectedTaskInfo]);

  // Helper functions
  const identifyClusters = (taskList) => {
    const visited = new Set();
    const clusters = [];
    
    const dfs = (idx, cluster) => {
      if (visited.has(idx)) return;
      visited.add(idx);
      cluster.push(idx);
      
      taskList[idx].connections.forEach(connIdx => {
        dfs(connIdx, cluster);
      });
    };
    
    taskList.forEach((_, idx) => {
      if (!visited.has(idx)) {
        const cluster = [];
        dfs(idx, cluster);
        if (cluster.length > 1) clusters.push(cluster);
      }
    });
    
    return clusters;
  };

  const convexHull = (points) => {
    if (points.length < 3) return points;
    points.sort((a, b) => a.x - b.x || a.y - b.y);
    
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const hull = [];
    
    for (let p of points) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) {
        hull.pop();
      }
      hull.push(p);
    }
    
    const t = hull.length + 1;
    for (let i = points.length - 2; i >= 0; i--) {
      while (hull.length >= t && cross(hull[hull.length - 2], hull[hull.length - 1], points[i]) <= 0) {
        hull.pop();
      }
      hull.push(points[i]);
    }
    
    hull.pop();
    return hull;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 bg-gray-50 min-h-screen">
      {/* Homotopic Project Equivalence */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-4">
          <h2 className="text-2xl font-bold flex items-center gap-2 mb-2">
            <Mountain className="text-blue-600" />
            Homotopic Cliff Shed Construction
          </h2>
          <p className="text-gray-600 text-sm">
            Three radically different approaches to building a climber's shelter halfway up a cliff face.
            Watch how they continuously transform into each other while preserving critical safety and deadline constraints.
          </p>
        </div>
        
        <canvas 
          ref={homotopyCanvasRef}
          width={400}
          height={400}
          className="border border-gray-300 rounded w-full max-w-md mx-auto"
        />
        
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsHomotopyPlaying(!isHomotopyPlaying)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
            >
              {isHomotopyPlaying ? <Pause size={16} /> : <Play size={16} />}
              {isHomotopyPlaying ? 'Pause' : 'Play'} Transformation
            </button>
            <button
              onClick={() => {
                setHomotopyTime(0);
                setSelectedPath((selectedPath + 1) % 3);
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 flex items-center gap-2"
            >
              <RotateCcw size={16} />
              Skip to Next
            </button>
          </div>
          
          <div className="grid grid-cols-3 gap-2 text-xs">
            {projectPaths.map((path, idx) => (
              <div 
                key={idx}
                className={`p-2 rounded border-2 ${
                  idx === selectedPath ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
              >
                <div className="font-semibold" style={{ color: path.color }}>{path.name}</div>
                <div className="text-gray-600">{path.description}</div>
              </div>
            ))}
          </div>
          
          <div className="bg-blue-50 p-3 rounded">
            <p className="text-sm font-semibold text-blue-800 flex items-center gap-1">
              <Shield size={14} /> Why This Matters:
            </p>
            <p className="text-sm text-blue-700 mt-1">
              Weather conditions can force sudden strategy changes. Homotopic equivalence ensures
              you can smoothly transition from helicopter delivery to rope systems without 
              violating safety standards or missing the winter deadline.
            </p>
          </div>
        </div>
      </div>

      {/* Morphogenetic Task Fields */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-4">
          <h2 className="text-2xl font-bold flex items-center gap-2 mb-2">
            <Hammer className="text-purple-600" />
            Self-Organizing Construction Tasks
          </h2>
          <p className="text-gray-600 text-sm">
            Shed construction tasks emit fields based on their dependencies and synergies.
            Watch as foundation, structural, weatherproofing, and safety tasks self-organize into optimal construction phases.
          </p>
        </div>
        
        <div className="relative">
          <canvas 
            ref={morphoCanvasRef}
            width={400}
            height={400}
            className="border border-gray-300 rounded w-full max-w-md mx-auto cursor-pointer"
            onMouseMove={(e) => {
              const rect = e.target.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              const scale = 400 / rect.width;
              
              const hoveredTask = tasks.findIndex(task => {
                const dist = Math.sqrt(Math.pow(task.x - x * scale, 2) + Math.pow(task.y - y * scale, 2));
                return dist < 15;
              });
              
              setSelectedTaskInfo(hoveredTask >= 0 ? hoveredTask : null);
            }}
            onMouseLeave={() => setSelectedTaskInfo(null)}
          />
        </div>
        
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsFieldAnimating(!isFieldAnimating)}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-2"
            >
              {isFieldAnimating ? <Pause size={16} /> : <Zap size={16} />}
              {isFieldAnimating ? 'Pause' : 'Activate'} Fields
            </button>
            <button
              onClick={() => {
                setTasks(tasks.map(t => ({
                  ...t,
                  x: 200 + (Math.random() - 0.5) * 300,
                  y: 200 + (Math.random() - 0.5) * 300,
                  vx: 0,
                  vy: 0
                })));
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 flex items-center gap-2"
            >
              <RotateCcw size={16} />
              Scatter Tasks
            </button>
          </div>
          
          <div>
            <label className="text-sm font-medium text-gray-700">Field Strength:</label>
            <input
              type="range"
              min="0.1"
              max="2"
              step="0.1"
              value={fieldStrength}
              onChange={(e) => setFieldStrength(parseFloat(e.target.value))}
              className="w-full mt-1"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(taskTypes).map(([type, info]) => (
              <div key={type} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-lg">{info.icon}</span>
                <span style={{ color: info.color }} className="font-medium">{info.name}</span>
              </div>
            ))}
          </div>
          
          <div className="bg-purple-50 p-3 rounded">
            <p className="text-sm font-semibold text-purple-800 flex items-center gap-1">
              <Clock size={14} /> Emergent Efficiency:
            </p>
            <p className="text-sm text-purple-700 mt-1">
              Tasks naturally cluster into construction phases: anchoring congregates first,
              structural tasks form the next phase, then weatherproofing emerges, with safety
              systems integrating throughout. No central scheduler needed!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectInnovationPrototypes;