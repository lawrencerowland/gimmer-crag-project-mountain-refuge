import networkx as nx
import matplotlib.pyplot as plt

# Create a multilayer graph representation using a DiGraph
G = nx.DiGraph()

# Layer 1: Outputs
output_nodes = ["Completed Shed", "Permitting Complete", "Foundation Complete"]
for node in output_nodes:
    G.add_node(node, layer="Outputs")

# Layer 2: WBS
wbs_nodes = ["Site Preparation", "Foundation Construction", "Shed Framing",
             "Permit Acquisition", "Roofing", "Siding"]
for node in wbs_nodes:
    G.add_node(node, layer="WBS")

# Layer 3: Resources
resource_nodes = ["Concrete", "Wood", "Labor", "Crane", "Permits"]
for node in resource_nodes:
    G.add_node(node, layer="Resources")

# Layer 4: Use Cases
use_case_nodes = ["Normal Weather", "High Winds", "Heavy Rainfall"]
for node in use_case_nodes:
    G.add_node(node, layer="Use Cases")

# Add connections between layers
# Outputs <-> WBS
G.add_edge("Completed Shed", "Shed Framing")
G.add_edge("Completed Shed", "Roofing")
G.add_edge("Completed Shed", "Siding")
G.add_edge("Foundation Complete", "Foundation Construction")
G.add_edge("Permitting Complete", "Permit Acquisition")

# WBS <-> Resources
G.add_edge("Foundation Construction", "Concrete")
G.add_edge("Foundation Construction", "Labor")
G.add_edge("Shed Framing", "Wood")
G.add_edge("Shed Framing", "Labor")
G.add_edge("Roofing", "Wood")
G.add_edge("Roofing", "Labor")
G.add_edge("Siding", "Wood")
G.add_edge("Siding", "Labor")
G.add_edge("Site Preparation", "Labor")
G.add_edge("Permit Acquisition", "Permits")

# WBS <-> Use Cases
G.add_edge("Foundation Construction", "Heavy Rainfall")
G.add_edge("Shed Framing", "High Winds")
G.add_edge("Roofing", "High Winds")

def draw_multilayer_network(G, output_file="multilayer_graph.png"):
    layers = {"Outputs": 0, "WBS": 1, "Resources": 2, "Use Cases": 3}
    pos = {}
    for node in G.nodes():
        layer = G.nodes[node]['layer']
        x = layers[layer]
        nodes_in_layer = [n for n in G.nodes() if G.nodes[n]['layer'] == layer]
        y = nodes_in_layer.index(node) / len(nodes_in_layer)
        pos[node] = (x, y)

    colors = {"Outputs": "skyblue", "WBS": "lightgreen",
              "Resources": "salmon", "Use Cases": "yellow"}
    node_colors = [colors[G.nodes[node]['layer']] for node in G.nodes()]

    plt.figure(figsize=(12, 8))
    nx.draw_networkx(G, pos=pos, with_labels=True, node_color=node_colors,
                     font_size=9, node_size=1500, font_weight='bold',
                     arrowsize=15, connectionstyle='arc3,rad=0.1')
    from matplotlib.lines import Line2D
    legend_elements = [Line2D([0], [0], marker='o', color='w',
                              markerfacecolor=color, markersize=10, label=layer)
                       for layer, color in colors.items()]
    plt.legend(handles=legend_elements, loc='upper right')
    plt.title("Multilayer Graph for Cliff Shed Project")
    plt.axis('off')
    plt.tight_layout()
    plt.savefig(output_file)
    print(f"Graph saved to {output_file}")
    print(f"Number of nodes: {G.number_of_nodes()}")
    print(f"Number of edges: {G.number_of_edges()}")

if __name__ == "__main__":
    draw_multilayer_network(G)
