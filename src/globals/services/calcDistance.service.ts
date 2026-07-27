// import { Decimal } from '@prisma/client/runtime/library';
// import axios from 'axios';

// export class Distance {
//   async GetNearestPoint(
//     givenPoint: { lat: Decimal; lng: Decimal },
//     points: { lng: Decimal; lat: Decimal }[],
//   ) {
//     let distance = Infinity;
//     let lat;
//     let lng;

//     for (const point of points) {
//       const harvestDistance = this.harvest(
//         point.lat,
//         point.lng,
//         givenPoint.lat,
//         givenPoint.lng,
//       );
//       if (harvestDistance < distance) {
//         distance = harvestDistance;
//         lat = point.lat;
//         lng = point.lng;
//       }
//     }

//     return { lat, lng, distance };
//   }

//   async GetTheNearestStores(
//     userLocation: { lat: Decimal; lng: Decimal },
//     stores: any,
//   ) {
//     const data = [];
//     const FormatedStores = await this.addNearestPointAttributesToStores(
//       stores,locale,
//       userLocation,
//     );

//     for (let i = 0; i < 10; i += 1) {
//       const url = `https://router.project-osrm.org/table/v1/driving/${userLocation.lat},${userLocation.lng};${FormatedStores[i].lat},${FormatedStores[i].lng}`;
//       console.log(url);
//       try {
//         const z4 = await axios.get(url);
//         // console.log(response);
//         data.push({
//           ...FormatedStores[i],
//           distance: z4.data.destinations[1].distance,
//         });
//       } catch (error) {
//         console.log(error);
//         console.error('Error fetching nearest store:', error.message);
//         return null;
//       }
//     }
//     return data;
//   }

//   private harvest(lat1: Decimal, lng1: Decimal, lat2: Decimal, lng2: Decimal) {
//     const R = 6371e3;
//     const φ1 = (+lat1 * Math.PI) / 180;
//     const φ2 = (+lat2 * Math.PI) / 180;
//     const Δφ = ((+lat2 - +lat1) * Math.PI) / 180;
//     const Δλ = ((+lng2 - +lng1) * Math.PI) / 180;

//     const a =
//       Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
//       Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
//     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

//     return R * c;
//   }

//   private async addNearestPointAttributesToStores(
//     stores: { Zone: { Point: { lat: Decimal; lng: Decimal }[] } }[],
//     givenPoint: { lng: Decimal; lat: Decimal },
//   ): Promise<any[]> {
//     const nearestPoint = await this.GetNearestPoint(
//       { lat: givenPoint.lat, lng: givenPoint.lng },
//       stores[0].Zone.Point,
//     );
//     console.log(nearestPoint);
//     return Promise.all(
//       stores.map(async (store) => {
//         const nearestPoint = await this.GetNearestPoint(
//           { lat: givenPoint.lat, lng: givenPoint.lng },
//           store.Zone.Point,
//         );

//         return {
//           ...store,
//           lat: nearestPoint.lat,
//           lng: nearestPoint.lng,
//         };
//       }),
//     );
//   }
// }
