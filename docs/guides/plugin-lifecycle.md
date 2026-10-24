# Plugin Lifecycle

```text
validate -> dependency check -> setup -> active
              |                    |
              +-- failure ---------+--> reverse-order rollback
active -> uninstall -> cleanup/resources -> inactive
chart.destroy -> all active plugins disposed
```

`PluginHandle.dispose()` is idempotent. The registry prevents uninstalling a
plugin required by another active plugin. An activation error disposes all
registrations made before the failure and leaves no partial plugin. Cleanup
errors are surfaced as lifecycle errors after the registry has removed the
plugin, so applications can log them without retaining a broken instance.
