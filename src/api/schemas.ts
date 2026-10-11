import { z } from 'zod';

// Ergast/Jolpica send every number as a string; coerce and validate. Points can be decimals (half points).
const num = z.coerce.number().refine(Number.isFinite, 'not a number');

const driver = z.object({
  driverId: z.string().min(1),
  code: z.string().optional(),
  givenName: z.string(),
  familyName: z.string(),
});
const constructor = z.object({ constructorId: z.string().min(1), name: z.string() });

const mrData = <T extends z.ZodType>(inner: T) =>
  z.object({ MRData: z.object({ total: num, limit: num, offset: num }).and(inner) });

export const driverStandingsSchema = mrData(
  z.object({
    StandingsTable: z.object({
      season: z.string(),
      StandingsLists: z.array(
        z.object({
          DriverStandings: z.array(
            z.object({ points: num, wins: num, Driver: driver, Constructors: z.array(constructor) }),
          ),
        }),
      ),
    }),
  }),
);

export const constructorStandingsSchema = mrData(
  z.object({
    StandingsTable: z.object({
      season: z.string(),
      StandingsLists: z.array(
        z.object({ ConstructorStandings: z.array(z.object({ points: num, wins: num, Constructor: constructor })) }),
      ),
    }),
  }),
);

export const scheduleSchema = mrData(
  z.object({
    RaceTable: z.object({
      season: z.string(),
      Races: z.array(
        z.object({
          round: num,
          raceName: z.string(),
          date: z.string(),
          Sprint: z.object({ date: z.string() }).optional(),
        }),
      ),
    }),
  }),
);

const result = z.object({
  position: num,
  positionText: z.string(),
  points: num,
  Driver: driver,
  Constructor: constructor,
});

export const resultsSchema = mrData(
  z.object({ RaceTable: z.object({ Races: z.array(z.object({ round: num, Results: z.array(result) })) }) }),
);
export const sprintSchema = mrData(
  z.object({ RaceTable: z.object({ Races: z.array(z.object({ round: num, SprintResults: z.array(result) })) }) }),
);

export type DriverStandingsResponse = z.infer<typeof driverStandingsSchema>;
export type ConstructorStandingsResponse = z.infer<typeof constructorStandingsSchema>;
export type ScheduleResponse = z.infer<typeof scheduleSchema>;
export type ApiResult = z.infer<typeof result>;
/** Results grouped by round, pages already merged. */
export type RoundResults = { round: number; results: ApiResult[] }[];
