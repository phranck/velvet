import { dump } from "js-yaml";

import type { MaintenanceService } from "./types.js";

export function createMaintenanceIssueForm(
  services: MaintenanceService[],
  maintenanceLabel: string,
): string {
  const options = services.flatMap((service) => [
    `${service.name} (all checks) [${service.id}/*]`,
    ...service.checks.map(
      (check) => `${service.name} / ${check.name} [${service.id}/${check.id}]`,
    ),
  ]);

  return dump(
    {
      name: "Planned maintenance",
      description: "Schedule maintenance and show it in the status history.",
      title: "[Maintenance] ",
      labels: [maintenanceLabel],
      body: [
        {
          type: "markdown",
          attributes: {
            value:
              "Velvet keeps monitoring during maintenance. Select only the services and checks covered by this work.",
          },
        },
        {
          type: "dropdown",
          id: "affected-targets",
          attributes: {
            label: "Affected services and checks",
            description: "Select every service or individual check covered by this maintenance.",
            multiple: true,
            options,
          },
          validations: { required: true },
        },
        {
          type: "input",
          id: "starts-at",
          attributes: {
            label: "Starts at",
            description:
              "Use an ISO 8601 timestamp with a time zone, for example 2026-08-01T22:00:00+02:00.",
            placeholder: "2026-08-01T22:00:00+02:00",
          },
          validations: { required: true },
        },
        {
          type: "input",
          id: "ends-at",
          attributes: {
            label: "Ends at",
            description:
              "Use an ISO 8601 timestamp with a time zone, for example 2026-08-01T23:30:00+02:00.",
            placeholder: "2026-08-01T23:30:00+02:00",
          },
          validations: { required: true },
        },
        {
          type: "textarea",
          id: "summary",
          attributes: {
            label: "Summary",
            description: "Briefly describe the planned work.",
            placeholder: "Database and application updates.",
          },
          validations: { required: true },
        },
      ],
    },
    { noRefs: true, lineWidth: -1 },
  );
}
