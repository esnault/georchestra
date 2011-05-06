class Artifacts {

    final def project
    final def artifacts
    final def nameMap
    final def simpleNameMap


    Artifacts(project, aliasFunction = versionNumToPrivateMapping({return null})) {
        this.project = project
        this.artifacts = new File(project.properties['warsDir']).listFiles().collect {
            new Artifact(it, aliasFunction)
        }
        this.nameMap = toNameMap()
        this.simpleNameMap = toSimpleNameMap()
    }

    /**
     * The default aliasFunction.
     *
     * The explicitMapping closure is first called.  If it returns non null that is the return value
     *
     * If explicitMapping returns null then the name is processed as follows:
     * if the artifact is of the form:  .+-<version>.war then the <version> is
     * replaced with the word private.
     *
     * For example extractorapp-1.0.war will be mapped to extractorapp-private.war
     *
     * @param explicitMapping a function to override the default behaviour
     */
    static def versionNumToPrivateMapping(explictMapping) {
        return {file ->
            def explicitAlias = explictMapping(file)
            if (explicitAlias != null) return explicitAlias
            else {
                def regex = /(.+)-.+\.war/
                if (file.name ==~ regex) {
                    def matcher = file.name =~ regex
                    return matcher[0][1]+"-private.war"
                } else {
                    return file.name
                }
            }
        }
    }

    def foreach(closure) {
        artifacts.each {closure(it)}
    }

    private def toSimpleNameMap() {
        def map = [:]
        artifacts.each { a -> map[a.simpleName] = a}
        return map
    }

    private def toNameMap() {
        def map = [:]
        artifacts.each { a -> map[a.name] = a}
        return map
    }

    /**
     * Create an artifact from a string, file or artifact object
     */
    static def createArtifact(obj) {
        if (obj instanceof File) {
            return new Artifact(obj)
        } else if (obj instanceof Artifact) {
            return obj
        } else {
            return new Artifact(new File(obj))
        }
    }

}