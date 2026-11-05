;; SPDX-License-Identifier: AGPL-3.0-or-later
;; Pure scalar transformation. No memory, imports, hardware or network access.
;; Units, timestamp, source and session belong to the host envelope and are preserved.
(module
  (func (export "process") (param $value f64) (param $factor f64) (result f64)
    local.get $value
    local.get $factor
    f64.mul))
