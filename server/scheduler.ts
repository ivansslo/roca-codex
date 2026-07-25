import cron from 'node-cron';
import { db } from './db';
import { toolImplementations } from './tools';

export function initScheduler() {
  console.log("Initializing scheduler...");
  const routines = db.getScheduledRoutines();
  routines.forEach(routine => {
    if (routine.active) {
      console.log(`Scheduling routine: ${routine.name} (${routine.cron})`);
      cron.schedule(routine.cron, async () => {
        console.log(`Running scheduled routine: ${routine.name}`);
        try {
          const result = await toolImplementations['self_develop_capability']({
              action: 'execute',
              name: routine.capabilityName
          });
          db.addLog({
            timestamp: new Date().toISOString(),
            toolName: 'self_develop_capability',
            args: { name: routine.capabilityName },
            result: result
          });
          console.log(`Successfully executed scheduled routine: ${routine.name}`);
        } catch (e) {
          console.error(`Failed to execute scheduled routine: ${routine.name}`, e);
        }
      });
    }
  });
}
