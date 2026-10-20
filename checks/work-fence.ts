import { settleBusyJob } from "../server/session.js";

let failures = 0;

function fail(why: string): void {
  failures += 1;
  console.log(`FAIL ${why}`);
}

const job = {};
const other = {};

if (
  settleBusyJob({
    epoch: 1,
    jobEpoch: 1,
    cancel: job,
    jobCancel: job,
    busy: true,
  }) !== "commit"
) {
  fail("the job that still owns the controller should commit");
}

if (
  settleBusyJob({
    epoch: 2,
    jobEpoch: 1,
    cancel: undefined,
    jobCancel: job,
    busy: true,
  }) !== "release"
) {
  fail("interrupt should release busy without a successor");
}

if (
  settleBusyJob({
    epoch: 2,
    jobEpoch: 1,
    cancel: job,
    jobCancel: job,
    busy: true,
  }) !== "release"
) {
  fail("abort without clearing the controller should still release");
}

if (
  settleBusyJob({
    epoch: 2,
    jobEpoch: 1,
    cancel: other,
    jobCancel: job,
    busy: true,
  }) !== "leave"
) {
  fail("a newer job's controller should be left alone");
}

if (
  settleBusyJob({
    epoch: 2,
    jobEpoch: 1,
    cancel: undefined,
    jobCancel: job,
    busy: false,
  }) !== "leave"
) {
  fail("concept switch clears busy before the next job starts");
}

if (failures) {
  console.log(`${failures} failed`);
  process.exit(1);
}
console.log("work fence ok");
