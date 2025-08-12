<script lang="ts">
    import Debug from "../components/debug/debug.svelte";
    import SplineTest from "../components/debug/spline_test.svelte";
    import Passthrough from "../components/nodes/display.svelte";
    import FicsuitSession from "../components/ficsuit_session.svelte";
    import FloatingPane from "../components/layout/floating_pane.svelte";
    import PaneRow from "../components/layout/pane_row.svelte";
    import Workspace from "../components/layout/workspace.svelte";
    import Display from "../components/nodes/display.svelte";
    import ScriptInput from "../components/nodes/inputs/script_input.svelte";
    import Execute from "../components/nodes/execute.svelte";
    import Feed from "../components/nodes/feed.svelte";
    import Emptiness from "../components/layout/emptiness.svelte";
</script>

<div style="position: absolute; width: 100%; height: 100%;">
    <!-->
    <PaneRow leftPercent={20} rightPercent={80}>
        <FicsuitSession slot=left />
        <Workspace slot=right>
            <FloatingPane title="Input" x=5em y=5em>
                <ScriptInput />
            </FloatingPane>
            <FloatingPane title="Debug" x=45em y=5em>
                <Debug />
            </FloatingPane>
            <Execute x=5em y=45em />
            <FloatingPane title="Feed" x=45em y=45em>
                <Feed />
            </FloatingPane>
        </Workspace>
    </PaneRow>
    <!-->
    <Workspace />
</div>
