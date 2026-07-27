#!/bin/bash
# setup-osrm.sh — Prepare OSRM data for Egypt
set -e

DATA_DIR="./osrm-data"
mkdir -p "$DATA_DIR"

echo "Downloading Egypt OSM extract from Geofabrik..."
curl -L -o "$DATA_DIR/egypt-latest.osm.pbf" http://download.geofabrik.de/africa/egypt-latest.osm.pbf

echo "Extracting OSRM data using car profile..."
docker run --rm -v "$(pwd)/osrm-data:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/egypt-latest.osm.pbf

echo "Partitioning OSRM data..."
docker run --rm -v "$(pwd)/osrm-data:/data" osrm/osrm-backend osrm-partition /data/egypt-latest.osm

echo "Customizing OSRM data..."
docker run --rm -v "$(pwd)/osrm-data:/data" osrm/osrm-backend osrm-customize /data/egypt-latest.osm

echo "OSRM data preparation completed successfully!"
