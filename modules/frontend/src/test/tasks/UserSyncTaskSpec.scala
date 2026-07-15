/*
 * Copyright 2018 Comcast Cable Communications Management, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package tasks

import cats.effect.IO
import controllers.{UserAccountAccessor, UserSyncProvider}
import org.junit.runner.RunWith
import org.specs2.mock.Mockito
import org.specs2.mutable.Specification
import org.specs2.runner.JUnitRunner
import vinyldns.core.domain.membership.{LockStatus, User}
import vinyldns.core.domain.Encrypted

import java.time.Instant
import java.time.temporal.ChronoUnit

@RunWith(classOf[JUnitRunner])
class UserSyncTaskSpec extends Specification with Mockito {

  val activeUser: User = User(
    "frodo", "key", Encrypted("secret"),
    Some("Frodo"), Some("Baggins"), Some("frodo@shire.me"),
    Instant.now.truncatedTo(ChronoUnit.MILLIS), "frodo-uuid"
  )

  val lockedUser: User = User(
    "locked", "lockedKey", Encrypted("lockedSecret"),
    None, None, None,
    Instant.now.truncatedTo(ChronoUnit.MILLIS), "locked-uuid",
    isTest = false,
    lockStatus = LockStatus.Locked
  )

  val testUser: User = User(
    "testuser", "testKey", Encrypted("testSecret"),
    None, None, None,
    Instant.now.truncatedTo(ChronoUnit.MILLIS), "test-uuid",
    isTest = true
  )

  "UserSyncTask" should {
    "run with dryRun=false locks stale users" in {
      val mockAccessor = mock[UserAccountAccessor]
      val mockSyncProvider = mock[UserSyncProvider]

      mockAccessor.getAllUsers.returns(IO.pure(List(activeUser, lockedUser, testUser)))
      // only activeUser passes the filter (not locked, not test)
      mockSyncProvider.getStaleUsers(List(activeUser)).returns(IO.pure(List(activeUser)))
      mockAccessor.lockUsers(List(activeUser)).returns(IO.pure(List(activeUser)))

      val task = new UserSyncTask(mockAccessor, mockSyncProvider, dryRun = false)
      task.run().unsafeRunSync()

      there.was(one(mockAccessor).getAllUsers)
      there.was(one(mockSyncProvider).getStaleUsers(List(activeUser)))
      there.was(one(mockAccessor).lockUsers(List(activeUser)))
    }

    "run with dryRun=true logs but does NOT lock users" in {
      val mockAccessor = mock[UserAccountAccessor]
      val mockSyncProvider = mock[UserSyncProvider]

      mockAccessor.getAllUsers.returns(IO.pure(List(activeUser)))
      mockSyncProvider.getStaleUsers(List(activeUser)).returns(IO.pure(List(activeUser)))

      val task = new UserSyncTask(mockAccessor, mockSyncProvider, dryRun = true)
      task.run().unsafeRunSync()

      there.was(one(mockAccessor).getAllUsers)
      there.was(one(mockSyncProvider).getStaleUsers(List(activeUser)))
      there.was(no(mockAccessor).lockUsers(any[List[User]]))
    }

    "run filters out locked and test users before checking stale" in {
      val mockAccessor = mock[UserAccountAccessor]
      val mockSyncProvider = mock[UserSyncProvider]

      mockAccessor.getAllUsers.returns(IO.pure(List(activeUser, lockedUser, testUser)))
      mockSyncProvider.getStaleUsers(List(activeUser)).returns(IO.pure(List.empty))
      mockAccessor.lockUsers(List.empty).returns(IO.pure(List.empty))

      val task = new UserSyncTask(mockAccessor, mockSyncProvider, dryRun = false)
      task.run().unsafeRunSync()

      // syncProvider only receives the active, non-test user
      there.was(one(mockSyncProvider).getStaleUsers(List(activeUser)))
      // lockUsers called with empty list (no stale users)
      there.was(one(mockAccessor).lockUsers(List.empty))
    }

    "run with empty user list completes without error" in {
      val mockAccessor = mock[UserAccountAccessor]
      val mockSyncProvider = mock[UserSyncProvider]

      mockAccessor.getAllUsers.returns(IO.pure(List.empty))
      mockSyncProvider.getStaleUsers(List.empty).returns(IO.pure(List.empty))
      mockAccessor.lockUsers(List.empty).returns(IO.pure(List.empty))

      val task = new UserSyncTask(mockAccessor, mockSyncProvider, dryRun = false)
      task.run().unsafeRunSync() must not(throwAn[Exception])
    }
  }
}
