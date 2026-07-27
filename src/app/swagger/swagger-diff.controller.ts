// src/swagger-diff/swagger-diff.controller.ts
import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import { diff } from 'json-diff';

@Controller('swagger-diff')
export class SwaggerDiffController {
  private readonly CURRENT_SWAGGER_PATH = './swagger-spec.json';
  private readonly PREVIOUS_SWAGGER_PATH = './swagger-spec-previous.json';

  @Get()
  async getSwaggerDiff(@Res() res: Response) {
    let message = '';
    let detailedChangesHtml = '';
    let initialSpecContent = '';
    let isError = false;

    try {
      if (!fs.existsSync(this.CURRENT_SWAGGER_PATH)) {
        isError = true;
        message = `Current Swagger spec file not found at ${this.CURRENT_SWAGGER_PATH}. Please run your NestJS app first.`;
      } else {
        const currentSwagger = JSON.parse(
          fs.readFileSync(this.CURRENT_SWAGGER_PATH, 'utf8'),
        );

        if (!fs.existsSync(this.PREVIOUS_SWAGGER_PATH)) {
          message =
            'No previous Swagger spec found. This is the initial version.';
          initialSpecContent = `<pre>${JSON.stringify(currentSwagger, null, 2)}</pre>`;
        } else {
          const previousSwagger = JSON.parse(
            fs.readFileSync(this.PREVIOUS_SWAGGER_PATH, 'utf8'),
          );

          const differences = diff(previousSwagger, currentSwagger);
          if (!differences) {
            message = 'No changes detected in Swagger specification.';
            detailedChangesHtml = `<p class="no-changes">No API changes detected since the last version.</p>`;
          } else {
            message = 'Changes detected in Swagger specification!';
            detailedChangesHtml = this.formatDifferences(
              differences,
              previousSwagger,
              currentSwagger,
            );
            fs.writeFileSync(
              this.PREVIOUS_SWAGGER_PATH,
              JSON.stringify(currentSwagger, null, 2),
              { encoding: 'utf8' },
            );
          }
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error fetching Swagger diff:', error);
      isError = true;
      message = `An error occurred while comparing Swagger specifications: ${error.message}`;
    }

    // Build the HTML response
    const htmlResponse = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Swagger API Changes</title>
          <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; background-color: #f8f9fa; color: #343a40; }
              .container { max-width: 900px; margin: 0 auto; background-color: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
              h1 { color: #007bff; text-align: center; margin-bottom: 30px; }
              h2 { color: #343a40; border-bottom: 1px solid #dee2e6; padding-bottom: 10px; margin-top: 30px; }
              h3 { color: #495057; margin-top: 20px; margin-bottom: 10px; }
              ul { list-style: none; padding-left: 0; }
              li { margin-bottom: 8px; padding: 5px 0; border-bottom: 1px dashed #e9ecef; }
              li:last-child { border-bottom: none; }
              .added { color: #28a745; font-weight: bold; } /* Green for additions */
              .removed { color: #dc3545; font-weight: bold; } /* Red for removals */
              .changed { color: #ffc107; font-weight: bold; } /* Yellow for changes */
              .message { padding: 15px; border-radius: 5px; margin-bottom: 20px; text-align: center; font-weight: bold; }
              .message.no-changes { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
              .message.initial-version { background-color: #e2e6ea; color: #383d41; border: 1px solid #d6d8db; }
              .message.has-changes { background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba; }
              .message.error-message { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
              .code-block { background-color: #e9ecef; padding: 15px; border-radius: 5px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; font-family: 'Consolas', 'Monaco', monospace; line-height: 1.4; color: #333; }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>Swagger API Changes Report</h1>

              <div class="message ${isError ? 'error-message' : detailedChangesHtml ? 'has-changes' : initialSpecContent ? 'initial-version' : 'no-changes'}">
                  ${message}
              </div>

              ${initialSpecContent ? `<h2>Current Swagger Specification (Initial Version)</h2><div class="code-block">${initialSpecContent}</div>` : ''}
              ${detailedChangesHtml ? `<h2>Detailed Changes</h2>${detailedChangesHtml}` : ''}

          </div>
      </body>
      </html>
    `;

    res.type('text/html').status(HttpStatus.OK).send(htmlResponse);
  }

  // --- NEW METHOD FOR FORMATTING DIFFERENCES ---
  private formatDifferences(
    differences: any,
    prevSpec: any,
    currentSpec: any,
  ): string {
    let htmlOutput = '';

    // 1. Path Changes (Added/Removed/Renamed Endpoints)
    if (differences.paths) {
      const pathChanges = [];
      const prevPaths = prevSpec.paths || {};
      const currentPaths = currentSpec.paths || {};

      // Check for removed paths
      for (const path in prevPaths) {
        if (!currentPaths[path]) {
          pathChanges.push(
            `<li class="removed">Removed Path: <strong>${path}</strong></li>`,
          );
        }
      }

      // Check for added paths
      for (const path in currentPaths) {
        if (!prevPaths[path]) {
          pathChanges.push(
            `<li class="added">Added Path: <strong>${path}</strong></li>`,
          );
        }
      }

      // Check for renamed paths (more complex, requires content comparison)
      // This is a simplified check. A robust rename detection would need to compare the entire path object content.
      // For now, we'll rely on added/removed.

      if (pathChanges.length > 0) {
        htmlOutput += `<h3>Path (Endpoint) Changes:</h3><ul>${pathChanges.join('')}</ul>`;
      }
    }
    for (const schema in differences.components?.schemas || {}) {
      const schemaDiff = differences.components.schemas[schema];
      if (schemaDiff['properties']) {
        htmlOutput += `<h3>Schema Changes for <strong>${schema}</strong>:</h3><ul>`;
        const schemaChanges = schemaDiff['properties'];
        for (const change in schemaChanges) {
          if (change.includes('__added')) {
            htmlOutput += `<li class="added">Added in Schema: ${schemaDiff[`${Object.keys(schemaDiff)[0]}`]}<strong>
            <pre>${change.replace('__added', '')}</pre><strong></strong>
            </strong></li>`;
          } else if (change.includes('__deleted')) {
            htmlOutput += `<li class="removed">Removed Schema: ${schemaDiff[`${Object.keys(schemaDiff)[0]}`]}<strong><pre>${change.replace('__deleted', '')}</pre><strong></strong>
            </strong></li>`;
          } else if (change === '~') {
            htmlOutput += `<li class="changed">Modified Schema: <strong>${schema}</strong></li>`;
          }
        }
        htmlOutput += `</ul>`;
      }
    }
    // htmlOutput += `<h3>Detailed Changes within Paths:${differences.components.schemas}</h3>`;
    // 2. Changes within existing Paths (Parameters, Body, Responses, etc.)
    // if (differences.paths && differences.paths['~']) {
    //   // "~" indicates changes within existing path keys
    //   const changedPathKeys = differences.paths['~'];

    //   for (const path in changedPathKeys) {
    //     // Skip paths that were entirely added or removed (handled above)
    //     if (!prevSpec.paths[path] || !currentSpec.paths[path]) continue;

    //     const pathDiff = changedPathKeys[path];
    //     const pathSpecificChanges = [];

    //     for (const method in pathDiff) {
    //       // e.g., 'get', 'post', 'put'
    //       if (method === '~') continue; // Skip the 'root' change indicator for path level

    //       const methodDiff = pathDiff[method]; // Diff for 'get' or 'post'
    //       if (!methodDiff) continue;

    //       pathSpecificChanges.push(
    //         `<h4>Method: <span class="changed">${method.toUpperCase()} ${path}</span></h4>`,
    //       );

    //       // Parameters changes
    //       if (methodDiff.parameters) {
    //         const paramsDiff = methodDiff.parameters;
    //         pathSpecificChanges.push(`<h5>Parameter Changes:</h5><ul>`);
    //         if (Array.isArray(paramsDiff)) {
    //           // Array diff for parameters
    //           paramsDiff.forEach((pDiff) => {
    //             if (pDiff[0] === '+') {
    //               pathSpecificChanges.push(
    //                 `<li class="added">Added Parameter: <strong>${pDiff[1].name}</strong> (in: ${pDiff[1].in})</li>`,
    //               );
    //             } else if (pDiff[0] === '-') {
    //               pathSpecificChanges.push(
    //                 `<li class="removed">Removed Parameter: <strong>${pDiff[1].name}</strong> (in: ${pDiff[1].in})</li>`,
    //               );
    //             } else if (pDiff['~']) {
    //               // Changes within an existing parameter
    //               // This indicates a change in parameter properties
    //               const changedParamName = Object.keys(pDiff['~'])[0]; // Get the name of the changed parameter
    //               const paramChanges = pDiff['~'][changedParamName]['~']; // Access the inner diff for the parameter
    //               pathSpecificChanges.push(
    //                 `<li class="changed">Modified Parameter: <strong>${changedParamName}</strong>`,
    //               );
    //               if (paramChanges.required)
    //                 pathSpecificChanges.push(
    //                   `<ul><li>Required: <span class="removed">${paramChanges.required[0]}</span> &rarr; <span class="added">${paramChanges.required[1]}</span></li></ul>`,
    //                 );
    //               if (paramChanges.description)
    //                 pathSpecificChanges.push(
    //                   `<ul><li>Description Changed</li></ul>`,
    //                 );
    //               // ... add more checks for schema, example, etc.
    //               pathSpecificChanges.push(`</li>`);
    //             }
    //           });
    //         } else {
    //           // Object diff for parameters (less common, usually array)
    //           // Fallback for object diff, might need more specific handling
    //           pathSpecificChanges.push(
    //             `<li class="changed">Parameters modified: <div class="code-block"><pre>${JSON.stringify(paramsDiff, null, 2)}</pre></div></li>`,
    //           );
    //         }
    //         pathSpecificChanges.push(`</ul>`);
    //       }

    //       // Request Body changes
    //       if (methodDiff.requestBody) {
    //         pathSpecificChanges.push(`<h5>Request Body Changes:</h5>`);
    //         const requestBodyDiff = methodDiff.requestBody;
    //         if (
    //           requestBodyDiff['~'] &&
    //           requestBodyDiff['~'].content &&
    //           requestBodyDiff['~'].content['~']
    //         ) {
    //           const contentDiff = requestBodyDiff['~'].content['~'];
    //           for (const mediaType in contentDiff) {
    //             // e.g., 'application/json'
    //             if (
    //               contentDiff[mediaType]['~'] &&
    //               contentDiff[mediaType]['~'].schema &&
    //               contentDiff[mediaType]['~'].schema['~']
    //             ) {
    //               const schemaDiff = contentDiff[mediaType]['~'].schema['~'];
    //               pathSpecificChanges.push(
    //                 `<li class="changed">Body Schema (${mediaType}) Modified:</li>`,
    //               );
    //               pathSpecificChanges.push(`<ul>`);
    //               // Iterate over changed properties in schema
    //               if (schemaDiff.properties && schemaDiff.properties['~']) {
    //                 for (const propName in schemaDiff.properties['~']) {
    //                   const propChange = schemaDiff.properties['~'][propName];
    //                   if (propChange[0] === '+') {
    //                     pathSpecificChanges.push(
    //                       `<li class="added">Added Body Property: <strong>${propName}</strong></li>`,
    //                     );
    //                   } else if (propChange[0] === '-') {
    //                     pathSpecificChanges.push(
    //                       `<li class="removed">Removed Body Property: <strong>${propName}</strong></li>`,
    //                     );
    //                   } else if (propChange['~']) {
    //                     pathSpecificChanges.push(
    //                       `<li class="changed">Modified Body Property: <strong>${propName}</strong></li>`,
    //                     );
    //                   }
    //                 }
    //               }
    //               if (schemaDiff.required) {
    //                 pathSpecificChanges.push(
    //                   `<li class="changed">Required Body Properties Changed</li>`,
    //                 );
    //               }
    //               pathSpecificChanges.push(`</ul>`);
    //             }
    //           }
    //         } else {
    //           pathSpecificChanges.push(
    //             `<li class="changed">Request Body modified: <div class="code-block"><pre>${JSON.stringify(requestBodyDiff, null, 2)}</pre></div></li>`,
    //           );
    //         }
    //       }

    //       // Responses changes
    //       if (methodDiff.responses) {
    //         pathSpecificChanges.push(`<h5>Response Changes:</h5>`);
    //         const responsesDiff = methodDiff.responses;
    //         if (responsesDiff['~']) {
    //           for (const statusCode in responsesDiff['~']) {
    //             responsesDiff['~'][statusCode];
    //             pathSpecificChanges.push(
    //               `<li class="changed">Status Code ${statusCode} response modified.</li>`,
    //             );
    //             // Can dive deeper into description, content schema changes here
    //           }
    //         } else if (responsesDiff['+']) {
    //           pathSpecificChanges.push(
    //             `<li class="added">Added Response for Status Code: <strong>${Object.keys(responsesDiff['+'][0])[0]}</strong></li>`,
    //           );
    //         } else if (responsesDiff['-']) {
    //           pathSpecificChanges.push(
    //             `<li class="removed">Removed Response for Status Code: <strong>${Object.keys(responsesDiff['-'][0])[0]}</strong></li>`,
    //           );
    //         }
    //       }

    //       if (pathSpecificChanges.length > 0) {
    //         htmlOutput += `<div style="border: 1px solid #ddd; padding: 15px; margin-bottom: 20px; border-radius: 5px;">${pathSpecificChanges.join('')}</div>`;
    //       }
    //     }
    //   }
    // }

    // You can add more sections here for components, tags, security, etc.
    // ...

    if (!htmlOutput) {
      return `<p class="no-changes">No specific API changes could be categorized. Raw diff if any: <div class="code-block"><pre>${JSON.stringify(differences, null, 2)}</pre></div></p>`;
    }

    return htmlOutput;
  }
  // --- END NEW METHOD ---
}
